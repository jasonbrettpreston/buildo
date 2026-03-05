/**
 * SPEC LINK: docs/specs/36_web_search_enrichment.md
 *
 * Logic tests for web search enrichment: phone extraction, email extraction,
 * website detection, social link extraction, and search query construction.
 */
import { describe, it, expect } from 'vitest';
import {
  extractPhoneNumbers,
  extractEmails,
  extractEmailsFromHtml,
  extractWebsite,
  extractSocialLinks,
  extractContacts,
  buildSearchQuery,
  extractCity,
} from '@/lib/builders/extract-contacts';
import type { SerperOrganicResult, SerperResponse } from '@/lib/builders/extract-contacts';

// ---------------------------------------------------------------------------
// Mock Serper response (based on real API call for Greengold Construction)
// ---------------------------------------------------------------------------

const MOCK_SERPER_RESPONSE: SerperResponse = {
  organic: [
    {
      title: 'GreenGold Construction Ltd. (@greengoldconstruction) - Instagram',
      link: 'https://www.instagram.com/greengoldconstruction/?hl=en',
      snippet: 'Luxury Construction Management Firm Toronto & Beyond',
      position: 1,
    },
    {
      title: 'GREENGOLD CONSTRUCTION LTD - Project Photos & Reviews',
      link: 'https://www.houzz.com/professionals/home-builders/greengold-construction-ltd-pfvwus-pf~252837004',
      snippet: 'GreenGold Construction Ltd ; Contact. Hart Lambert ; Phone Number. (416) 487-0359 ; Address. Toronto, Ontario M5R 1R5 Canada',
      position: 2,
      rating: 5,
      ratingCount: 1,
    },
    {
      title: 'Testimonials | greengold',
      link: 'https://www.greengoldbuild.com/testimonials',
      snippet: 'I recently completed a renovation with GreenGold Construction',
      position: 3,
    },
    {
      title: 'GreenGold Construction - LinkedIn',
      link: 'https://ca.linkedin.com/company/greengold-construction',
      snippet: 'Toronto foremost boutique contracting firm',
      position: 4,
    },
    {
      title: 'Greengold Construction Ltd - MapQuest',
      link: 'https://www.mapquest.com/ca/ontario/greengold-construction-ltd-359381480',
      snippet: '247 Davenport Rd, Toronto, ON, M5R 1J9.',
      position: 5,
    },
    {
      title: 'GreenGold Construction - ZoomInfo',
      link: 'https://www.zoominfo.com/c/greengold-construction-ltd/356842048',
      snippet: 'Phone number: (416) 487-0359 Website: www.greengoldbuild.com',
      position: 6,
    },
    {
      title: 'Greengold Construction Ltd - Yellow Pages',
      link: 'https://www.yellowpages.ca/bus/Ontario/York/Greengold-Construction-Ltd/7933408.html',
      snippet: 'Greengold Construction Ltd - York - phone number, website & address',
      position: 7,
    },
    {
      title: 'Build with Confidence - Facebook',
      link: 'https://www.facebook.com/100083262194847/posts/build-with-confidence/690302210421846/',
      snippet: 'Build with Confidence and Live with Peace of Mind',
      position: 8,
    },
  ],
};

describe('Web Search Enrichment', () => {
  describe('Phone Extraction', () => {
    it('extracts (416) formatted phone from snippet', () => {
      const phones = extractPhoneNumbers(['Phone Number. (416) 487-0359']);
      expect(phones).toContain('(416) 487-0359');
    });

    it('extracts dash-separated phone', () => {
      const phones = extractPhoneNumbers(['Call us at 647-555-1234 today']);
      expect(phones).toContain('(647) 555-1234');
    });

    it('extracts phone with country code', () => {
      const phones = extractPhoneNumbers(['Contact: +1-905-123-4567']);
      expect(phones).toContain('(905) 123-4567');
    });

    it('extracts dot-separated phone', () => {
      const phones = extractPhoneNumbers(['Tel: 416.555.9876']);
      expect(phones).toContain('(416) 555-9876');
    });

    it('de-duplicates repeated phone numbers', () => {
      const phones = extractPhoneNumbers([
        'Phone: (416) 487-0359',
        'Call (416) 487-0359 for info',
      ]);
      expect(phones).toHaveLength(1);
    });

    it('rejects non-Ontario area codes', () => {
      const phones = extractPhoneNumbers(['Call 212-555-1234']);
      expect(phones).toHaveLength(0);
    });

    it('returns empty for no phones', () => {
      const phones = extractPhoneNumbers(['No phone here']);
      expect(phones).toHaveLength(0);
    });

    it('accepts GTA area code 289', () => {
      const phones = extractPhoneNumbers(['Tel: 289-555-0123']);
      expect(phones).toContain('(289) 555-0123');
    });
  });

  describe('Email Extraction', () => {
    it('extracts email from snippet', () => {
      const emails = extractEmails(['Contact us at info@greengoldbuild.com for quotes']);
      expect(emails).toContain('info@greengoldbuild.com');
    });

    it('lowercases emails', () => {
      const emails = extractEmails(['Email: John@Builder.CA']);
      expect(emails).toContain('john@builder.ca');
    });

    it('rejects noreply addresses', () => {
      const emails = extractEmails(['From noreply@service.com']);
      expect(emails).toHaveLength(0);
    });

    it('rejects example.com emails', () => {
      const emails = extractEmails(['test@example.com']);
      expect(emails).toHaveLength(0);
    });

    it('de-duplicates emails', () => {
      const emails = extractEmails([
        'Email: info@test.ca',
        'Contact info@test.ca',
      ]);
      expect(emails).toHaveLength(1);
    });

    it('returns empty for no emails', () => {
      const emails = extractEmails(['No contact info here']);
      expect(emails).toHaveLength(0);
    });
  });

  describe('Website Extraction', () => {
    it('returns first non-directory URL', () => {
      const results: SerperOrganicResult[] = [
        { title: 'Instagram', link: 'https://www.instagram.com/builder', snippet: '', position: 1 },
        { title: 'Builder Site', link: 'https://www.greengoldbuild.com/testimonials', snippet: '', position: 2 },
      ];
      expect(extractWebsite(results)).toBe('https://www.greengoldbuild.com');
    });

    it('skips all directory/social sites', () => {
      const results: SerperOrganicResult[] = [
        { title: 'IG', link: 'https://www.instagram.com/x', snippet: '', position: 1 },
        { title: 'YP', link: 'https://www.yellowpages.ca/x', snippet: '', position: 2 },
        { title: 'Yelp', link: 'https://www.yelp.ca/x', snippet: '', position: 3 },
      ];
      expect(extractWebsite(results)).toBeNull();
    });

    it('skips houzz.com', () => {
      const results: SerperOrganicResult[] = [
        { title: 'Houzz', link: 'https://www.houzz.com/professionals/x', snippet: '', position: 1 },
      ];
      expect(extractWebsite(results)).toBeNull();
    });

    it('returns null for empty results', () => {
      expect(extractWebsite([])).toBeNull();
    });
  });

  describe('Social Link Extraction', () => {
    it('extracts Instagram link', () => {
      const results: SerperOrganicResult[] = [
        { title: 'IG', link: 'https://www.instagram.com/greengoldconstruction/?hl=en', snippet: '', position: 1 },
      ];
      expect(extractSocialLinks(results).instagram).toBe('https://www.instagram.com/greengoldconstruction/?hl=en');
    });

    it('extracts LinkedIn link', () => {
      const results: SerperOrganicResult[] = [
        { title: 'LI', link: 'https://ca.linkedin.com/company/greengold-construction', snippet: '', position: 1 },
      ];
      expect(extractSocialLinks(results).linkedin).toBe('https://ca.linkedin.com/company/greengold-construction');
    });

    it('extracts Facebook link', () => {
      const results: SerperOrganicResult[] = [
        { title: 'FB', link: 'https://www.facebook.com/100083262194847/posts/123', snippet: '', position: 1 },
      ];
      expect(extractSocialLinks(results).facebook).toBe('https://www.facebook.com/100083262194847/posts/123');
    });

    it('extracts Houzz link', () => {
      const results: SerperOrganicResult[] = [
        { title: 'Houzz', link: 'https://www.houzz.com/professionals/home-builders/greengold', snippet: '', position: 1 },
      ];
      expect(extractSocialLinks(results).houzz).toBe('https://www.houzz.com/professionals/home-builders/greengold');
    });

    it('returns null for missing social platforms', () => {
      const links = extractSocialLinks([]);
      expect(links.instagram).toBeNull();
      expect(links.facebook).toBeNull();
      expect(links.linkedin).toBeNull();
      expect(links.houzz).toBeNull();
    });

    it('keeps first match per platform', () => {
      const results: SerperOrganicResult[] = [
        { title: 'IG 1', link: 'https://www.instagram.com/first', snippet: '', position: 1 },
        { title: 'IG 2', link: 'https://www.instagram.com/second', snippet: '', position: 2 },
      ];
      expect(extractSocialLinks(results).instagram).toBe('https://www.instagram.com/first');
    });
  });

  describe('Full Contact Extraction', () => {
    it('extracts all contact types from mock response', () => {
      const contacts = extractContacts(MOCK_SERPER_RESPONSE);
      expect(contacts.phone).toBe('(416) 487-0359');
      expect(contacts.website).toBe('https://www.greengoldbuild.com');
      expect(contacts.instagram).toContain('instagram.com');
      expect(contacts.linkedin).toContain('linkedin.com');
      expect(contacts.facebook).toContain('facebook.com');
      expect(contacts.houzz).toContain('houzz.com');
    });

    it('uses knowledge graph phone when available', () => {
      const response: SerperResponse = {
        knowledgeGraph: { phone: '(416) 555-1234' },
        organic: [],
      };
      const contacts = extractContacts(response);
      expect(contacts.phone).toBe('(416) 555-1234');
    });

    it('uses knowledge graph website when available', () => {
      const response: SerperResponse = {
        knowledgeGraph: { website: 'https://acmebuilders.ca' },
        organic: [],
      };
      const contacts = extractContacts(response);
      expect(contacts.website).toBe('https://acmebuilders.ca');
    });

    it('returns all nulls for empty response', () => {
      const contacts = extractContacts({ organic: [] });
      expect(contacts.phone).toBeNull();
      expect(contacts.email).toBeNull();
      expect(contacts.website).toBeNull();
      expect(contacts.instagram).toBeNull();
    });
  });

  describe('City Extraction', () => {
    it('extracts city from WSIB address format', () => {
      expect(extractCity('123 Main St, Toronto, ON, M5V 1A1')).toBe('Toronto');
    });

    it('extracts city from PO Box format', () => {
      expect(extractCity('PO Box 96, Stratton, ON, P0W 1N0')).toBe('Stratton');
    });

    it('handles unit number prefix', () => {
      expect(extractCity('908-4415 Bathurst Street, Toronto, ON, M3H 3S1')).toBe('Toronto');
    });

    it('returns null for null address', () => {
      expect(extractCity(null)).toBeNull();
    });

    it('returns null for empty address', () => {
      expect(extractCity('')).toBeNull();
    });
  });

  describe('HTML Email Extraction', () => {
    it('extracts email from mailto: link', () => {
      const html = '<a href="mailto:info@greengoldbuild.com">Email us</a>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toContain('info@greengoldbuild.com');
    });

    it('extracts email from mailto: with query params', () => {
      const html = '<a href="mailto:sales@builder.ca?subject=Quote">Contact</a>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toContain('sales@builder.ca');
    });

    it('extracts email from visible text in HTML', () => {
      const html = '<p>Contact us at contact@modular.ca for more info</p>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toContain('contact@modular.ca');
    });

    it('rejects noreply and example.com emails from HTML', () => {
      const html = '<a href="mailto:noreply@service.com">No</a><p>user@example.com</p>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toHaveLength(0);
    });

    it('de-duplicates emails from mailto and text', () => {
      const html = '<a href="mailto:info@builder.ca">Email</a><p>info@builder.ca</p>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toHaveLength(1);
    });

    it('returns empty for HTML with no emails', () => {
      const html = '<html><body><h1>Welcome</h1><p>No contact info</p></body></html>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toHaveLength(0);
    });

    it('extracts multiple different emails', () => {
      const html = '<a href="mailto:info@builder.ca">Info</a><a href="mailto:sales@builder.ca">Sales</a>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toHaveLength(2);
      expect(emails).toContain('info@builder.ca');
      expect(emails).toContain('sales@builder.ca');
    });

    it('lowercases emails from HTML', () => {
      const html = '<a href="mailto:John@Builder.CA">Email</a>';
      const emails = extractEmailsFromHtml(html);
      expect(emails).toContain('john@builder.ca');
    });
  });

  describe('Search Query Construction', () => {
    it('uses trade name when available', () => {
      const query = buildSearchQuery({
        name: 'GREENGOLD CONSTRUCTION LTD',
        trade_name: 'Greengold Construction',
        mailing_address: '37 Bartlett Ave, Toronto, ON, M6H 3E8',
      });
      expect(query).toBe('"Greengold Construction" "Toronto" contractor');
    });

    it('falls back to legal name when no trade name', () => {
      const query = buildSearchQuery({
        name: 'ACME CONSTRUCTION',
        legal_name: '1234567 Ontario Inc.',
        trade_name: null,
        mailing_address: '123 Main St, Mississauga, ON, L5A 2T1',
      });
      expect(query).toBe('"1234567 Ontario Inc." "Mississauga" contractor');
    });

    it('falls back to builder name when no trade or legal name', () => {
      const query = buildSearchQuery({
        name: 'SMITH BUILDERS',
        mailing_address: null,
      });
      expect(query).toBe('"SMITH BUILDERS" "Toronto" contractor');
    });

    it('defaults city to Toronto when address is null', () => {
      const query = buildSearchQuery({
        name: 'TEST',
        trade_name: 'Test Builder',
        mailing_address: null,
      });
      expect(query).toContain('"Toronto"');
    });
  });
});
