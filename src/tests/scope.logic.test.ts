import { describe, it, expect } from 'vitest';
import {
  classifyProjectType,
  extractScopeTags,
  extractResidentialTags,
  extractNewHouseTags,
  isResidentialStructure,
  classifyScope,
  classifyUseType,
  parseTagPrefix,
  formatScopeTag,
  getScopeTagColor,
  extractBasePermitNum,
  isBLDPermit,
} from '@/lib/classification/scope';
import { createMockPermit } from '@/tests/factories';

// ---------------------------------------------------------------------------
// classifyProjectType
// ---------------------------------------------------------------------------

describe('classifyProjectType', () => {
  describe('Tier 1 — work field', () => {
    it('work="New Building" → new_build', () => {
      expect(classifyProjectType(createMockPermit({ work: 'New Building' }))).toBe('new_build');
    });

    it('work="Addition(s)" → addition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Addition(s)' }))).toBe('addition');
    });

    it('work="Interior Alterations" → renovation', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Interior Alterations' }))).toBe('renovation');
    });

    it('work="Demolition" → demolition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Demolition' }))).toBe('demolition');
    });

    it('work="Deck" → addition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Deck' }))).toBe('addition');
    });

    it('work="Porch" → addition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Porch' }))).toBe('addition');
    });

    it('work="Garage" → addition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Garage' }))).toBe('addition');
    });

    it('work="Pool" → addition', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Pool' }))).toBe('addition');
    });

    it('work containing "Repair" → repair', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Structural Repair' }))).toBe('repair');
    });

    it('work containing "Fire Damage" → repair', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Fire Damage Repair' }))).toBe('repair');
    });

    it('work containing "Balcony/Guard" → repair', () => {
      expect(classifyProjectType(createMockPermit({ work: 'Balcony/Guard' }))).toBe('repair');
    });
  });

  describe('Tier 2 — permit_type field', () => {
    it('permit_type="New Houses Created" → new_build', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Other',
        permit_type: 'New Houses Created',
      }))).toBe('new_build');
    });

    it('permit_type="New Building" → new_build', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Other',
        permit_type: 'New Building',
      }))).toBe('new_build');
    });

    it('permit_type="Demolition Folder (DM)" → demolition', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Other',
        permit_type: 'Demolition Folder (DM)',
      }))).toBe('demolition');
    });

    it('permit_type="Plumbing(PS)" with non-building work → mechanical', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Building Permit Related(PS)',
        permit_type: 'Plumbing(PS)',
      }))).toBe('mechanical');
    });

    it('permit_type="Mechanical(MS)" → mechanical', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Building Permit Related(MS)',
        permit_type: 'Mechanical(MS)',
      }))).toBe('mechanical');
    });

    it('permit_type="Drain and Site Service" → mechanical', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Site Service',
        permit_type: 'Drain and Site Service',
      }))).toBe('mechanical');
    });

    it('permit_type="Electrical" → mechanical', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Wiring',
        permit_type: 'Electrical',
      }))).toBe('mechanical');
    });

    it('plumbing permit_type with building work is NOT mechanical', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Addition(s)',
        permit_type: 'Plumbing(PS)',
      }))).toBe('addition');
    });
  });

  describe('Tier 3 — description fallback', () => {
    it('description with "new construction" → new_build', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Multiple Projects',
        permit_type: 'Building',
        description: 'New construction of 3-storey detached dwelling',
      }))).toBe('new_build');
    });

    it('description with "demolition" → demolition', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Multiple Projects',
        permit_type: 'Building',
        description: 'Complete demolition of existing structure',
      }))).toBe('demolition');
    });

    it('description with "addition" → addition', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Multiple Projects',
        permit_type: 'Building',
        description: 'Rear addition and new deck',
      }))).toBe('addition');
    });

    it('description with "renovation" → renovation', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Multiple Projects',
        permit_type: 'Building',
        description: 'Interior renovation of kitchen and bathroom',
      }))).toBe('renovation');
    });

    it('description with "interior alterations" → renovation', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Other',
        permit_type: 'Building',
        description: 'Interior alterations to ground floor office',
      }))).toBe('renovation');
    });

    it('description with "repair" → repair', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Other',
        permit_type: 'Building',
        description: 'Structural repair to foundation wall',
      }))).toBe('repair');
    });

    it('description with "addtion" typo → addition', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Multiple Projects',
        permit_type: 'Building',
        description: 'Proposal to construct side addtion',
      }))).toBe('addition');
    });
  });

  describe('Default fallback', () => {
    it('unrecognized work/permit_type/description → other', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Signage',
        permit_type: 'Sign Permit',
        description: 'Install illuminated sign on building facade',
      }))).toBe('other');
    });
  });

  describe('Bug fixes', () => {
    it('work="Addition(s) " (trailing space) → addition', () => {
      expect(classifyProjectType(createMockPermit({
        work: 'Addition(s) ',
      }))).toBe('addition');
    });
  });
});

// ---------------------------------------------------------------------------
// extractScopeTags (general — non-residential)
// ---------------------------------------------------------------------------

describe('extractScopeTags', () => {
  describe('Structural tags', () => {
    it('description "2nd storey addition" → 2nd-floor, storey-addition', () => {
      const tags = extractScopeTags(createMockPermit({
        description: '2nd storey addition and rear deck',
      }));
      expect(tags).toContain('2nd-floor');
      expect(tags).toContain('storey-addition');
      expect(tags).toContain('deck');
    });

    it('description "second floor addition" → 2nd-floor', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'second floor addition',
      }));
      expect(tags).toContain('2nd-floor');
    });

    it('description "3rd floor" → 3rd-floor', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new 3rd floor addition',
      }));
      expect(tags).toContain('3rd-floor');
    });

    it('description "rear addition" → rear-addition', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'construct rear addition',
      }));
      expect(tags).toContain('rear-addition');
    });

    it('description "side extension" → side-addition', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'side extension to existing dwelling',
      }));
      expect(tags).toContain('side-addition');
    });

    it('description "basement underpinning" → basement, underpinning', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'basement underpinning to lower floor',
      }));
      expect(tags).toContain('basement');
      expect(tags).toContain('underpinning');
    });

    it('description "new foundation" → foundation', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'pour new foundation for garage',
      }));
      expect(tags).toContain('foundation');
      expect(tags).toContain('garage');
    });
  });

  describe('Exterior tags', () => {
    it('description "new rear deck" → deck', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new rear deck',
        storeys: 1,
      }));
      expect(tags).toEqual(['deck']);
    });

    it('work="Garage" extracts garage even with empty description', () => {
      const tags = extractScopeTags(createMockPermit({
        work: 'Garage',
        description: '',
      }));
      expect(tags).toContain('garage');
    });

    it('description "new porch and canopy" → porch, canopy', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new front porch and entrance canopy',
      }));
      expect(tags).toContain('porch');
      expect(tags).toContain('canopy');
    });

    it('description with "laneway suite" → laneway-suite', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'construct new laneway suite',
      }));
      expect(tags).toContain('laneway-suite');
    });

    it('description with "pool" → pool', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install new inground pool',
      }));
      expect(tags).toContain('pool');
    });

    it('description with "roofing" → roofing', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 're-roof existing dwelling',
      }));
      expect(tags).toContain('roofing');
    });
  });

  describe('Interior tags', () => {
    it('description "kitchen and bathroom renovation"', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'kitchen and bathroom renovation',
      }));
      expect(tags).toContain('kitchen');
      expect(tags).toContain('bathroom');
    });

    it('description "convert basement to 2nd unit"', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'convert basement to 2nd unit',
      }));
      expect(tags).toContain('basement');
      expect(tags).toContain('second-suite');
      expect(tags).toContain('convert-unit');
    });

    it('description "finish basement" → basement, basement-finish', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'finish basement for recreation room',
      }));
      expect(tags).toContain('basement');
      expect(tags).toContain('basement-finish');
    });

    it('description "open concept" → open-concept', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'remove bearing wall for open concept layout',
      }));
      expect(tags).toContain('open-concept');
    });

    it('description "secondary suite" → second-suite', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'create secondary suite in basement',
      }));
      expect(tags).toContain('second-suite');
    });

    it('description with "tenant" → tenant-fitout', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'tenant fit-out for new office space',
      }));
      expect(tags).toContain('tenant-fitout');
    });

    it('description with "leasehold improvements" → tenant-fitout', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'leasehold improvements to ground floor retail',
      }));
      expect(tags).toContain('tenant-fitout');
    });
  });

  describe('Building type tags from structure_type', () => {
    it('structure_type="Apartment Building" → apartment', () => {
      const tags = extractScopeTags(createMockPermit({
        structure_type: 'Apartment Building',
        description: 'lobby renovation',
      }));
      expect(tags).toContain('apartment');
    });

    it('description with "condominium" → condo', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new condominium development',
      }));
      expect(tags).toContain('condo');
    });

    it('structure_type with "Row House" → townhouse', () => {
      const tags = extractScopeTags(createMockPermit({
        structure_type: 'Row House',
        description: 'interior alterations',
      }));
      expect(tags).toContain('townhouse');
    });
  });

  describe('Scale tags from storeys', () => {
    it('12 storeys → high-rise', () => {
      const tags = extractScopeTags(createMockPermit({ storeys: 12, description: '' }));
      expect(tags).toContain('high-rise');
    });

    it('7 storeys → mid-rise', () => {
      const tags = extractScopeTags(createMockPermit({ storeys: 7, description: '' }));
      expect(tags).toContain('mid-rise');
    });

    it('3 storeys → low-rise', () => {
      const tags = extractScopeTags(createMockPermit({ storeys: 3, description: '' }));
      expect(tags).toContain('low-rise');
    });

    it('1 storey → no scale tag', () => {
      const tags = extractScopeTags(createMockPermit({ storeys: 1, description: 'small shed' }));
      expect(tags).not.toContain('high-rise');
      expect(tags).not.toContain('mid-rise');
      expect(tags).not.toContain('low-rise');
    });

    it('structure_type="Apartment Building" + 12 storeys → apartment, high-rise', () => {
      const tags = extractScopeTags(createMockPermit({
        structure_type: 'Apartment Building',
        storeys: 12,
        description: '',
      }));
      expect(tags).toContain('apartment');
      expect(tags).toContain('high-rise');
    });
  });

  describe('Systems tags', () => {
    it('description with "hvac" → hvac', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install new hvac system',
      }));
      expect(tags).toContain('hvac');
    });

    it('description with "furnace" → hvac', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'replace furnace and ductwork',
      }));
      expect(tags).toContain('hvac');
    });

    it('description with "sprinkler" → sprinkler', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install fire sprinkler system throughout',
      }));
      expect(tags).toContain('sprinkler');
    });

    it('description with "fire alarm" → fire-alarm', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'upgrade fire alarm system',
      }));
      expect(tags).toContain('fire-alarm');
    });

    it('description with "elevator" → elevator', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install new elevator',
      }));
      expect(tags).toContain('elevator');
    });

    it('description with "drain" → drain', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new sanitary drain and sewer connection',
      }));
      expect(tags).toContain('drain');
    });

    it('description with "sewer" → drain', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'sewer line replacement',
        storeys: 1,
      }));
      expect(tags).toContain('drain');
    });

    it('description with "backflow preventer" → backflow-preventer', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install backflow preventer device',
      }));
      expect(tags).toContain('backflow-preventer');
    });

    it('description with "backflow" alone → backflow-preventer', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'backflow prevention for commercial unit',
      }));
      expect(tags).toContain('backflow-preventer');
    });

    it('description with "maglock" → access-control', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install maglock on exit doors',
      }));
      expect(tags).toContain('access-control');
    });

    it('description with "access control" → access-control', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'upgrade access control system for building',
      }));
      expect(tags).toContain('access-control');
    });

    it('description with "card reader" → access-control', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'install card reader at main entrance',
      }));
      expect(tags).toContain('access-control');
    });
  });

  describe('Tags are sorted and deduplicated', () => {
    it('returns sorted unique tags', () => {
      const tags = extractScopeTags(createMockPermit({
        description: 'new rear deck and porch with basement walkout',
      }));
      const sorted = [...tags].sort();
      expect(tags).toEqual(sorted);
    });
  });
});

// ---------------------------------------------------------------------------
// extractResidentialTags
// ---------------------------------------------------------------------------

describe('extractResidentialTags', () => {
  const srp = (overrides: Partial<Parameters<typeof createMockPermit>[0]> = {}) =>
    createMockPermit({
      permit_type: 'Small Residential Projects',
      ...overrides,
    });

  describe('Storey extraction + addition defaulting', () => {
    it('"two storey rear addition" → [new:2-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Addition(s)',
        description: 'Proposal for two storey rear addition',
      }));
      expect(tags).toContain('new:2-storey-addition');
      expect(tags).not.toContain('new:1-storey-addition');
    });

    it('"three storey rear addition" → [new:3-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Addition(s)',
        description: 'Proposal for three storey rear addition',
      }));
      expect(tags).toContain('new:3-storey-addition');
    });

    it('"Proposal for a rear addition" (no storey) → [new:1-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Addition(s)',
        description: 'Proposal for a rear addition',
      }));
      expect(tags).toContain('new:1-storey-addition');
    });

    it('"1 storey rear addition" → [new:1-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for 1 storey rear addition',
      }));
      expect(tags).toContain('new:1-storey-addition');
    });

    it('"three-storey rear addition" (hyphenated) → [new:3-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for three-storey rear addition',
      }));
      expect(tags).toContain('new:3-storey-addition');
    });

    it('"single storey addition" → [new:1-storey-addition]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for single storey addition',
      }));
      expect(tags).toContain('new:1-storey-addition');
    });

    it('no generic addition tag ever — always storey-specific', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for rear addition',
      }));
      expect(tags.some(t => t === 'new:addition' || t === 'addition')).toBe(false);
      expect(tags).toContain('new:1-storey-addition');
    });
  });

  describe('Full permit extraction', () => {
    it('"two storey rear addition and basement underpinning" → dedup removes basement', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for two storey rear addition and basement underpinning',
      }));
      expect(tags).toContain('new:2-storey-addition');
      expect(tags).toContain('new:underpinning');
      expect(tags).not.toContain('new:basement');
    });

    it('"three storey rear addition and deck" → [new:3-storey-addition, new:deck]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for three storey rear addition and deck',
      }));
      expect(tags).toContain('new:3-storey-addition');
      expect(tags).toContain('new:deck');
    });

    it('"interior alterations to basement for secondary suite" → [new:second-suite] only', () => {
      const tags = extractResidentialTags(srp({
        description: 'Interior alterations to basement for secondary suite',
      }));
      expect(tags).toEqual(['new:second-suite']);
    });

    it('"removal of load bearing wall" → [new:open-concept]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Other',
        description: 'Removal of load bearing wall',
      }));
      expect(tags).toContain('new:open-concept');
    });

    it('complex multi-tag permit with dedup', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for two storey rear addition, deck, interior alterations, underpinning, porch',
      }));
      expect(tags).toContain('new:2-storey-addition');
      expect(tags).toContain('new:deck');
      expect(tags).toContain('new:porch');
      expect(tags).toContain('new:underpinning');
      expect(tags).toContain('alter:interior-alterations');
      // basement removed by underpinning dedup
      expect(tags).not.toContain('new:basement');
    });
  });

  describe('Deduplication rules', () => {
    it('Rule 1: basement + underpinning → underpinning only', () => {
      const tags = extractResidentialTags(srp({
        description: 'Basement underpinning for existing dwelling',
      }));
      expect(tags).toContain('new:underpinning');
      expect(tags).not.toContain('new:basement');
    });

    it('Rule 2: basement + second-suite → second-suite only', () => {
      const tags = extractResidentialTags(srp({
        work: 'Second Suite (New)',
        description: 'Create second suite in basement',
      }));
      expect(tags).toContain('new:second-suite');
      expect(tags).not.toContain('new:basement');
    });

    it('Rule 3: second-suite + interior-alterations → second-suite only', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for interior alterations to create a second suite',
      }));
      expect(tags).toContain('new:second-suite');
      expect(tags).not.toContain('alter:interior-alterations');
    });

    it('underpinning + second-suite → BOTH kept (genuinely different work)', () => {
      const tags = extractResidentialTags(srp({
        description: 'Underpinning and second suite in basement',
      }));
      expect(tags).toContain('new:underpinning');
      expect(tags).toContain('new:second-suite');
      // Basement removed by both rule 1 and rule 2
      expect(tags).not.toContain('new:basement');
    });

    it('"interior alterations to create secondary suite in basement" → [new:second-suite] only', () => {
      const tags = extractResidentialTags(srp({
        description: 'interior alterations to create secondary suite in basement',
      }));
      expect(tags).toEqual(['new:second-suite']);
    });

    it('Rule 4: accessory-building + garage → garage only', () => {
      const tags = extractResidentialTags(srp({
        work: 'Accessory Building(s)',
        description: 'Proposal for new detached garage',
      }));
      expect(tags).toContain('new:garage');
      expect(tags).not.toContain('new:accessory-building');
    });

    it('Rule 5: accessory-building + pool → pool only', () => {
      const tags = extractResidentialTags(srp({
        description: 'New pool and accessory building in rear yard',
      }));
      expect(tags).toContain('new:pool');
      expect(tags).not.toContain('new:accessory-building');
    });

    it('Rule 6: unit-conversion + second-suite → second-suite only', () => {
      const tags = extractResidentialTags(srp({
        description: 'Convert existing dwelling to create a second suite',
      }));
      expect(tags).toContain('new:second-suite');
      expect(tags).not.toContain('alter:unit-conversion');
    });
  });

  describe('Work-type classification', () => {
    it('interior-alterations = always alter', () => {
      const tags = extractResidentialTags(srp({
        description: 'Interior alterations to kitchen area',
      }));
      expect(tags).toContain('alter:interior-alterations');
      expect(tags).toContain('new:kitchen');
    });

    it('renovation = always alter (absorbed into interior-alterations)', () => {
      const tags = extractResidentialTags(srp({
        work: 'Other',
        description: 'Kitchen renovation',
      }));
      expect(tags).toContain('alter:interior-alterations');
      expect(tags).toContain('new:kitchen');
    });

    it('deck = default new', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for new rear deck',
      }));
      expect(tags).toContain('new:deck');
      expect(tags).not.toContain('alter:deck');
    });

    it('deck with repair signal = alter', () => {
      const tags = extractResidentialTags(srp({
        description: 'Replace existing deck at rear of dwelling',
      }));
      expect(tags).toContain('alter:deck');
      expect(tags).not.toContain('new:deck');
    });

    it('porch with repair then construct override = new', () => {
      const tags = extractResidentialTags(srp({
        description: 'Demolish existing and construct new porch',
      }));
      expect(tags).toContain('new:porch');
      expect(tags).not.toContain('alter:porch');
    });

    it('garage = default new', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for new detached garage',
      }));
      expect(tags).toContain('new:garage');
    });

    it('garage with repair = alter', () => {
      const tags = extractResidentialTags(srp({
        description: 'Repair existing garage roof and walls',
      }));
      expect(tags).toContain('alter:garage');
      expect(tags).not.toContain('new:garage');
    });

    it('underpinning = always new', () => {
      const tags = extractResidentialTags(srp({
        description: 'Underpinning of existing basement',
      }));
      expect(tags).toContain('new:underpinning');
    });
  });

  describe('New tag patterns', () => {
    it('work="Accessory Building(s)", desc="Proposed new shed" → [new:accessory-building]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Accessory Building(s)',
        description: 'Proposed new shed',
      }));
      expect(tags).toContain('new:accessory-building');
    });

    it('"convert existing dwelling to a duplex" → [alter:unit-conversion]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Convert existing dwelling to a duplex',
      }));
      expect(tags).toContain('alter:unit-conversion');
    });

    it('"interior alterations to convert SFD to 3-unit" → [alter:interior-alterations, alter:unit-conversion]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Interior alterations to convert SFD to 3-unit',
      }));
      expect(tags).toContain('alter:interior-alterations');
      expect(tags).toContain('alter:unit-conversion');
    });

    it('work="Fire Damage", desc="Structural repairs to dwelling" → [alter:fire-damage]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Fire Damage',
        description: 'Structural repairs to dwelling',
      }));
      expect(tags).toContain('alter:fire-damage');
    });

    it('"Proposal to construct a cabana in rear yard" → [new:accessory-building]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal to construct a cabana in rear yard',
      }));
      expect(tags).toContain('new:accessory-building');
    });

    it('"install new solar panels" → [new:solar]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Install new solar panels on roof',
      }));
      expect(tags).toContain('new:solar');
      expect(tags).toContain('new:roofing');
    });

    it('"new dormer at rear" → [new:dormer]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for new dormer at rear of dwelling',
      }));
      expect(tags).toContain('new:dormer');
    });

    it('"install steel beam" → [new:structural-beam]', () => {
      const tags = extractResidentialTags(srp({
        description: 'Install new steel beam for open concept',
      }));
      expect(tags).toContain('new:structural-beam');
      expect(tags).toContain('new:open-concept');
    });

    it('work="New Laneway / Rear Yard Suite" → [new:laneway-suite]', () => {
      const tags = extractResidentialTags(srp({
        work: 'New Laneway / Rear Yard Suite',
        description: 'Construct new laneway suite',
      }));
      expect(tags).toContain('new:laneway-suite');
    });

    it('work="Change of Use" → [alter:unit-conversion]', () => {
      const tags = extractResidentialTags(srp({
        work: 'Change of Use',
        description: 'Change dwelling from duplex to triplex',
      }));
      expect(tags).toContain('alter:unit-conversion');
    });
  });

  describe('Exclusion tests', () => {
    it('work="Party Wall Admin Permits" → empty tags array', () => {
      const tags = extractResidentialTags(srp({
        work: 'Party Wall Admin Permits',
        description: 'Party wall consent related to adjacent permit',
      }));
      expect(tags).toEqual([]);
    });
  });

  describe('Bug fix tests', () => {
    it('"secondary suite" regex matches', () => {
      const tags = extractResidentialTags(srp({
        description: 'Create secondary suite in basement',
      }));
      expect(tags).toContain('new:second-suite');
    });

    it('"addtion" typo in description still detects addition', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for rear addtion and deck',
      }));
      expect(tags).toContain('new:1-storey-addition');
      expect(tags).toContain('new:deck');
    });

    it('open-concept detected from "load-bearing wall" phrasing', () => {
      const tags = extractResidentialTags(srp({
        description: 'Remove load-bearing wall between kitchen and living room',
      }));
      expect(tags).toContain('new:open-concept');
      expect(tags).toContain('new:kitchen');
    });

    // ADD-WRONG-01/02: "addition of [feature]" should NOT trigger storey-addition
    it('"addition of a washroom" does NOT trigger storey-addition', () => {
      const tags = extractResidentialTags(srp({
        work: 'Interior Alterations',
        description: 'Interior alterations for addition of a washroom in basement',
      }));
      expect(tags).not.toContain('new:1-storey-addition');
      expect(tags).toContain('new:bathroom');
      expect(tags).toContain('new:basement');
    });

    it('"addition of a window" does NOT trigger storey-addition', () => {
      const tags = extractResidentialTags(srp({
        work: 'Interior Alterations',
        description: 'Proposal for addition of a window and door',
      }));
      expect(tags).not.toContain('new:1-storey-addition');
    });

    it('"addition of second storey" still triggers storey-addition (work=Addition)', () => {
      const tags = extractResidentialTags(srp({
        work: 'Addition(s)',
        description: 'Proposal for addition of second storey',
      }));
      expect(tags).toContain('new:1-storey-addition');
    });

    it('"rear addition" still triggers storey-addition', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for rear addition and deck',
      }));
      expect(tags).toContain('new:1-storey-addition');
      expect(tags).toContain('new:deck');
    });
  });

  describe('New residential tags — bathroom, laundry, fireplace', () => {
    it('"washroom" → new:bathroom', () => {
      const tags = extractResidentialTags(srp({
        description: 'Renovate existing washroom and add new washroom in basement',
      }));
      expect(tags).toContain('new:bathroom');
    });

    it('"bathroom" → new:bathroom', () => {
      const tags = extractResidentialTags(srp({
        description: 'Interior alterations to create new bathroom on second floor',
      }));
      expect(tags).toContain('new:bathroom');
    });

    it('"powder room" → new:bathroom', () => {
      const tags = extractResidentialTags(srp({
        description: 'Addition of powder room on main floor',
      }));
      expect(tags).toContain('new:bathroom');
    });

    it('"ensuite" → new:bathroom', () => {
      const tags = extractResidentialTags(srp({
        description: 'New ensuite in master bedroom',
      }));
      expect(tags).toContain('new:bathroom');
    });

    it('"laundry" → new:laundry', () => {
      const tags = extractResidentialTags(srp({
        description: 'Relocate laundry from basement to second floor',
      }));
      expect(tags).toContain('new:laundry');
    });

    it('"fireplace" → new:fireplace', () => {
      const tags = extractResidentialTags(srp({
        description: 'Install new fireplace in living room',
      }));
      expect(tags).toContain('new:fireplace');
    });

    it('work="Fireplace/Wood Stoves" → new:fireplace', () => {
      const tags = extractResidentialTags(srp({
        work: 'Fireplace/Wood Stoves',
        description: 'Install wood burning fireplace',
      }));
      expect(tags).toContain('new:fireplace');
    });

    it('"wood stove" → new:fireplace', () => {
      const tags = extractResidentialTags(srp({
        description: 'Install wood stove in basement',
      }));
      expect(tags).toContain('new:fireplace');
    });
  });

  describe('Tags are sorted', () => {
    it('returns sorted tags', () => {
      const tags = extractResidentialTags(srp({
        description: 'Proposal for two storey addition, deck, porch, underpinning',
      }));
      const sorted = [...tags].sort();
      expect(tags).toEqual(sorted);
    });
  });
});

// ---------------------------------------------------------------------------
// parseTagPrefix
// ---------------------------------------------------------------------------

describe('parseTagPrefix', () => {
  it('parses new: prefix', () => {
    expect(parseTagPrefix('new:deck')).toEqual({ work_type: 'new', slug: 'deck' });
  });

  it('parses alter: prefix', () => {
    expect(parseTagPrefix('alter:fire-damage')).toEqual({ work_type: 'alter', slug: 'fire-damage' });
  });

  it('unprefixed tag defaults to new', () => {
    expect(parseTagPrefix('basement')).toEqual({ work_type: 'new', slug: 'basement' });
  });
});

// ---------------------------------------------------------------------------
// isResidentialStructure
// ---------------------------------------------------------------------------

describe('isResidentialStructure', () => {
  it('structure_type starting with SFD → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'SFD - Detached' }))).toBe(true);
  });

  it('structure_type "SFD" alone → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'SFD' }))).toBe(true);
  });

  it('structure_type containing "Detached" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Semi-Detached' }))).toBe(true);
  });

  it('structure_type containing "Semi" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Semi' }))).toBe(true);
  });

  it('structure_type containing "Townhouse" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Townhouse' }))).toBe(true);
  });

  it('structure_type containing "Row House" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Row House' }))).toBe(true);
  });

  it('structure_type containing "Stacked" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Stacked Townhouse' }))).toBe(true);
  });

  it('proposed_use containing "residential" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Other', proposed_use: 'Residential' }))).toBe(true);
  });

  it('proposed_use containing "dwelling" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Other', proposed_use: 'Single Dwelling' }))).toBe(true);
  });

  it('proposed_use containing "duplex" → true', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Other', proposed_use: 'Duplex' }))).toBe(true);
  });

  it('structure_type "Office" + proposed_use "Commercial" → false', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Office', proposed_use: 'Commercial' }))).toBe(false);
  });

  it('structure_type "Apartment Building" + proposed_use "Apartment" → false', () => {
    expect(isResidentialStructure(createMockPermit({ structure_type: 'Apartment Building', proposed_use: 'Apartment' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractNewHouseTags
// ---------------------------------------------------------------------------

describe('extractNewHouseTags', () => {
  const nh = (overrides: Partial<Parameters<typeof createMockPermit>[0]> = {}) =>
    createMockPermit({
      permit_type: 'New Houses Created',
      work: 'New Building',
      structure_type: 'SFD - Detached',
      proposed_use: 'Residential',
      housing_units: 1,
      ...overrides,
    });

  describe('Building type classification cascade', () => {
    it('default SFD for simple new house', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with integral garage' }));
      expect(tags).toContain('new:sfd');
      expect(tags).toContain('new:garage');
    });

    it('proposed_use "detached houseplex (4 Units)" → houseplex-4-unit', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex (4 Units)',
        housing_units: 4,
        description: 'Construct new 3-storey houseplex',
      }));
      expect(tags).toContain('new:houseplex-4-unit');
      expect(tags).not.toContain('new:sfd');
    });

    it('proposed_use "houseplex (2 Units)" → houseplex-2-unit', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Semi-Detached Houseplex (2 Units)',
        housing_units: 2,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-2-unit');
    });

    it('proposed_use "houseplex (6 Units)" → houseplex-6-unit', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex (6 Units)',
        housing_units: 6,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-6-unit');
    });

    it('proposed_use "houseplex" without unit count → uses housing_units', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex',
        housing_units: 5,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-5-unit');
    });

    it('proposed_use "houseplex" without unit count or housing_units → defaults to 3', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex',
        housing_units: 0,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-3-unit');
    });

    it('unit count clamped to max 6', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex (8 Units)',
        housing_units: 8,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-6-unit');
    });

    it('unit count clamped to min 2', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex (1 Unit)',
        housing_units: 1,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-2-unit');
    });

    it('structure_type "3+ Unit" → houseplex using housing_units', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: '3+ Unit Housing',
        proposed_use: 'Residential',
        housing_units: 4,
        description: 'Construct new multi-unit dwelling',
      }));
      expect(tags).toContain('new:houseplex-4-unit');
    });

    it('structure_type "3+ Unit" without housing_units → defaults to 3', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: '3+ Unit Housing',
        proposed_use: 'Residential',
        housing_units: 0,
        description: 'Construct new multi-unit dwelling',
      }));
      expect(tags).toContain('new:houseplex-3-unit');
    });

    it('housing_units > 1 + description "houseplex" → uses housing_units', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: 'SFD - Detached',
        proposed_use: 'Residential',
        housing_units: 3,
        description: 'Construct new houseplex with garage',
      }));
      expect(tags).toContain('new:houseplex-3-unit');
      expect(tags).toContain('new:garage');
    });

    it('structure_type "Stacked Townhouses" → stacked-townhouse', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: 'Stacked Townhouses',
        description: 'Construct new stacked townhouse with walkout and finished basement',
      }));
      expect(tags).toContain('new:stacked-townhouse');
      expect(tags).toContain('new:walkout');
      expect(tags).toContain('new:finished-basement');
    });

    it('structure_type "Townhouse" → townhouse', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: 'Townhouse',
        description: 'Construct new townhouse',
      }));
      expect(tags).toContain('new:townhouse');
      expect(tags).not.toContain('new:sfd');
    });

    it('structure_type "Row House" → townhouse', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: 'Row House',
        description: 'Construct new row house with deck',
      }));
      expect(tags).toContain('new:townhouse');
      expect(tags).toContain('new:deck');
    });

    it('structure_type "Semi-Detached" → semi-detached', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: 'Semi-Detached',
        description: 'Construct new semi-detached dwelling',
      }));
      expect(tags).toContain('new:semi-detached');
      expect(tags).not.toContain('new:sfd');
    });

    it('cascade priority: proposed_use houseplex wins over structure_type stacked', () => {
      const tags = extractNewHouseTags(nh({
        proposed_use: 'Detached Houseplex (4 Units)',
        structure_type: 'Stacked Townhouses',
        housing_units: 4,
        description: 'Construct new houseplex',
      }));
      expect(tags).toContain('new:houseplex-4-unit');
      expect(tags).not.toContain('new:stacked-townhouse');
    });

    it('cascade priority: "3+ Unit" structure_type wins over stacked', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: '3+ Unit Stacked',
        proposed_use: 'Residential',
        housing_units: 5,
        description: 'Construct new multi-unit',
      }));
      expect(tags).toContain('new:houseplex-5-unit');
      expect(tags).not.toContain('new:stacked-townhouse');
    });
  });

  describe('Feature tags', () => {
    it('garage in description → new:garage', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with integral garage' }));
      expect(tags).toContain('new:garage');
    });

    it('deck in description → new:deck', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with rear deck' }));
      expect(tags).toContain('new:deck');
    });

    it('porch in description → new:porch', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with front porch' }));
      expect(tags).toContain('new:porch');
    });

    it('walkout in description → new:walkout', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with walkout basement' }));
      expect(tags).toContain('new:walkout');
    });

    it('walk-out (hyphenated) → new:walkout', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with walk-out' }));
      expect(tags).toContain('new:walkout');
    });

    it('balcony → new:balcony', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with balcony' }));
      expect(tags).toContain('new:balcony');
    });

    it('balconies (plural) → new:balcony', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with two balconies' }));
      expect(tags).toContain('new:balcony');
    });

    it('laneway in description → new:laneway-suite', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with laneway suite' }));
      expect(tags).toContain('new:laneway-suite');
    });

    it('garden suite in description → new:laneway-suite', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with garden suite' }));
      expect(tags).toContain('new:laneway-suite');
    });

    it('rear yard suite in description → new:laneway-suite', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with rear yard suite' }));
      expect(tags).toContain('new:laneway-suite');
    });

    it('finished basement → new:finished-basement', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD with finished basement' }));
      expect(tags).toContain('new:finished-basement');
    });

    it('finish basement (no -ed) → new:finished-basement', () => {
      const tags = extractNewHouseTags(nh({ description: 'Construct new SFD, finish basement' }));
      expect(tags).toContain('new:finished-basement');
    });

    it('multiple features combined', () => {
      const tags = extractNewHouseTags(nh({
        description: 'Construct new SFD with integral garage, deck, porch',
      }));
      expect(tags).toContain('new:sfd');
      expect(tags).toContain('new:garage');
      expect(tags).toContain('new:deck');
      expect(tags).toContain('new:porch');
    });
  });

  describe('Tags are sorted', () => {
    it('returns sorted tags', () => {
      const tags = extractNewHouseTags(nh({
        description: 'Construct new SFD with walkout, garage, deck, porch',
      }));
      const sorted = [...tags].sort();
      expect(tags).toEqual(sorted);
    });
  });

  describe('100% coverage guarantee', () => {
    it('empty description still gets building type', () => {
      const tags = extractNewHouseTags(nh({ description: '' }));
      expect(tags.length).toBeGreaterThanOrEqual(1);
      expect(tags).toContain('new:sfd');
    });

    it('minimal permit with no structure_type still defaults to SFD', () => {
      const tags = extractNewHouseTags(nh({
        structure_type: '',
        proposed_use: '',
        description: '',
      }));
      expect(tags).toEqual(['new:sfd']);
    });
  });
});

// ---------------------------------------------------------------------------
// extractResidentialTags — laneway/garden suite combined
// ---------------------------------------------------------------------------

describe('extractResidentialTags — laneway/garden suite', () => {
  const srp = (overrides: Partial<Parameters<typeof createMockPermit>[0]> = {}) =>
    createMockPermit({
      permit_type: 'Small Residential Projects',
      ...overrides,
    });

  it('"new garden suite in rear yard" → [new:laneway-suite]', () => {
    const tags = extractResidentialTags(srp({
      description: 'Construct new garden suite in rear yard',
    }));
    expect(tags).toContain('new:laneway-suite');
  });

  it('"new rear yard suite" → [new:laneway-suite]', () => {
    const tags = extractResidentialTags(srp({
      description: 'Proposal for new rear yard suite',
    }));
    expect(tags).toContain('new:laneway-suite');
  });

  it('"laneway suite" still works as before', () => {
    const tags = extractResidentialTags(srp({
      description: 'Construct new laneway suite',
    }));
    expect(tags).toContain('new:laneway-suite');
  });
});

// ---------------------------------------------------------------------------
// formatScopeTag
// ---------------------------------------------------------------------------

describe('formatScopeTag', () => {
  it('formats residential prefixed tags using config', () => {
    expect(formatScopeTag('new:deck')).toBe('Deck');
    expect(formatScopeTag('alter:fire-damage')).toBe('Fire Damage');
    expect(formatScopeTag('new:2-storey-addition')).toBe('2 Storey Addition');
    expect(formatScopeTag('alter:interior-alterations')).toBe('Interior Alterations');
  });

  it('formats unprefixed tags by splitting hyphens', () => {
    expect(formatScopeTag('basement-finish')).toBe('Basement Finish');
    expect(formatScopeTag('2nd-floor')).toBe('2nd Floor');
  });

  it('formats New House building type tags', () => {
    expect(formatScopeTag('new:sfd')).toBe('Single Family Detached');
    expect(formatScopeTag('new:semi-detached')).toBe('Semi-Detached');
    expect(formatScopeTag('new:townhouse')).toBe('Townhouse');
    expect(formatScopeTag('new:stacked-townhouse')).toBe('Stacked Townhouse');
    expect(formatScopeTag('new:houseplex-4-unit')).toBe('Houseplex 4 Units');
  });

  it('formats houseplex with storey count', () => {
    expect(formatScopeTag('new:houseplex-4-unit', 3)).toBe('Houseplex 4 Units · 3 Storeys');
    expect(formatScopeTag('new:houseplex-2-unit', 2)).toBe('Houseplex 2 Units · 2 Storeys');
    expect(formatScopeTag('new:houseplex-6-unit', 1)).toBe('Houseplex 6 Units · 1 Storey');
  });

  it('houseplex without storeys → just label', () => {
    expect(formatScopeTag('new:houseplex-4-unit')).toBe('Houseplex 4 Units');
    expect(formatScopeTag('new:houseplex-4-unit', 0)).toBe('Houseplex 4 Units');
  });

  it('formats finished-basement from NEW_HOUSE_TAG_CONFIG', () => {
    expect(formatScopeTag('new:finished-basement')).toBe('Finished Basement');
  });
});

// ---------------------------------------------------------------------------
// getScopeTagColor
// ---------------------------------------------------------------------------

describe('getScopeTagColor', () => {
  it('returns green for new: tags', () => {
    expect(getScopeTagColor('new:deck')).toBe('#16A34A');
  });

  it('returns orange for alter: tags', () => {
    expect(getScopeTagColor('alter:fire-damage')).toBe('#EA580C');
  });

  it('returns gray for unprefixed tags', () => {
    expect(getScopeTagColor('basement')).toBe('#6B7280');
  });

  it('returns emerald for New House building type tags', () => {
    expect(getScopeTagColor('new:sfd')).toBe('#059669');
    expect(getScopeTagColor('new:houseplex-4-unit')).toBe('#059669');
    expect(getScopeTagColor('new:stacked-townhouse')).toBe('#059669');
  });

  it('returns green for New House feature tag (finished-basement)', () => {
    expect(getScopeTagColor('new:finished-basement')).toBe('#16A34A');
  });
});

// ---------------------------------------------------------------------------
// classifyScope (integration)
// ---------------------------------------------------------------------------

describe('classifyScope', () => {
  it('returns both project_type and scope_tags', () => {
    const result = classifyScope(createMockPermit({
      work: 'Addition(s)',
      description: '2nd storey addition with new rear deck',
    }));
    expect(result.project_type).toBe('addition');
    expect(result.scope_tags).toContain('2nd-floor');
    expect(result.scope_tags).toContain('deck');
  });

  it('new_build with high-rise', () => {
    const result = classifyScope(createMockPermit({
      work: 'New Building',
      structure_type: 'Apartment Building',
      description: 'New 15-storey condo with retail at grade',
      storeys: 15,
    }));
    expect(result.project_type).toBe('new_build');
    expect(result.scope_tags).toContain('apartment');
    expect(result.scope_tags).toContain('condo');
    expect(result.scope_tags).toContain('high-rise');
    expect(result.scope_tags).toContain('retail');
  });

  it('mechanical permit', () => {
    const result = classifyScope(createMockPermit({
      work: 'Building Permit Related(PS)',
      permit_type: 'Plumbing(PS)',
      description: 'New plumbing for kitchen and bathroom',
    }));
    expect(result.project_type).toBe('mechanical');
    expect(result.scope_tags).toContain('plumbing');
    expect(result.scope_tags).toContain('kitchen');
    expect(result.scope_tags).toContain('bathroom');
  });

  it('demolition permit', () => {
    const result = classifyScope(createMockPermit({
      work: 'Demolition',
      permit_type: 'Demolition Folder (DM)',
      description: 'Complete demolition of existing garage',
    }));
    expect(result.project_type).toBe('demolition');
    expect(result.scope_tags).toContain('garage');
  });

  it('renovation with multiple scope tags', () => {
    const result = classifyScope(createMockPermit({
      work: 'Interior Alterations',
      description: 'Kitchen and bathroom renovation, open concept living area, new basement finish',
    }));
    expect(result.project_type).toBe('renovation');
    expect(result.scope_tags).toContain('kitchen');
    expect(result.scope_tags).toContain('bathroom');
    expect(result.scope_tags).toContain('open-concept');
    expect(result.scope_tags).toContain('basement');
    expect(result.scope_tags).toContain('basement-finish');
  });

  describe('Small Residential branching', () => {
    it('uses residential tags for Small Residential Projects', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Addition(s)',
        description: 'Proposal for two storey rear addition and deck',
      }));
      expect(result.scope_tags).toContain('new:2-storey-addition');
      expect(result.scope_tags).toContain('new:deck');
    });

    it('uses general tags for non-residential permits', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Building',
        work: 'Addition(s)',
        description: 'Two storey addition and deck',
      }));
      // General tags don't have new: prefix
      expect(result.scope_tags.some(t => t.startsWith('new:'))).toBe(false);
      expect(result.scope_tags).toContain('deck');
    });

    it('spot-check: "three storey rear addition and underpinning"', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Multiple Projects',
        description: 'Proposal for multiple projects (three storey rear addition and basement underpinning).',
      }));
      expect(result.scope_tags).toContain('new:3-storey-addition');
      expect(result.scope_tags).toContain('new:underpinning');
      expect(result.scope_tags).not.toContain('new:basement');
    });

    it('spot-check: "rear addition and deck" defaults to 1 storey', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Multiple Projects',
        description: 'Proposal for a rear addition and deck',
      }));
      expect(result.scope_tags).toContain('new:1-storey-addition');
      expect(result.scope_tags).toContain('new:deck');
    });

    it('spot-check: "Interior alterations to create secondary suite in basement"', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Interior Alterations',
        description: 'Interior alterations to create secondary suite in basement',
      }));
      expect(result.scope_tags).toContain('new:second-suite');
      expect(result.scope_tags).toContain('residential');
    });

    it('spot-check: Second Suite (New) work field with basement description', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Second Suite (New)',
        description: 'Proposed second suite in basement with interior alterations',
      }));
      expect(result.scope_tags).toContain('new:second-suite');
      expect(result.scope_tags).toContain('residential');
    });

    it('spot-check: "Interior alterations to basement, underpinning and second suite"', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Small Residential Projects',
        work: 'Multiple Projects',
        description: 'Interior alterations to basement, underpinning and second suite',
      }));
      expect(result.scope_tags).toContain('new:second-suite');
      expect(result.scope_tags).toContain('new:underpinning');
      expect(result.scope_tags).not.toContain('new:basement');
      expect(result.scope_tags).not.toContain('alter:interior-alterations');
    });
  });

  describe('New Houses branching', () => {
    it('New Houses Created → uses extractNewHouseTags', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'New Houses Created',
        work: 'New Building',
        structure_type: 'SFD - Detached',
        description: 'Construct new SFD with integral garage, deck, porch',
      }));
      expect(result.project_type).toBe('new_build');
      expect(result.scope_tags).toContain('new:sfd');
      expect(result.scope_tags).toContain('new:deck');
      expect(result.scope_tags).toContain('new:garage');
      expect(result.scope_tags).toContain('new:porch');
    });

    it('New Houses + houseplex → houseplex tag', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'New Houses Created',
        work: 'New Building',
        proposed_use: 'Detached Houseplex (4 Units)',
        housing_units: 4,
        storeys: 3,
        description: 'Construct new 3-storey houseplex',
      }));
      expect(result.scope_tags).toContain('new:houseplex-4-unit');
      expect(result.scope_tags).not.toContain('new:sfd');
    });

    it('New Houses + stacked townhouse → stacked-townhouse + features', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'New Houses Created',
        work: 'New Building',
        structure_type: 'Stacked Townhouses',
        description: 'Construct new stacked townhouse with walkout and finished basement',
      }));
      expect(result.scope_tags).toContain('new:stacked-townhouse');
      expect(result.scope_tags).toContain('new:walkout');
      expect(result.scope_tags).toContain('new:finished-basement');
    });

    it('New Houses + SFD with garden suite → [new:garage, new:laneway-suite, new:sfd]', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'New Houses Created',
        work: 'New Building',
        structure_type: 'SFD - Detached',
        description: 'Construct new SFD with garage and garden suite',
      }));
      expect(result.scope_tags).toContain('new:sfd');
      expect(result.scope_tags).toContain('new:garage');
      expect(result.scope_tags).toContain('new:laneway-suite');
    });
  });

  describe('Building Additions/Alterations branching', () => {
    it('residential A/A → uses residential tags', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Building Additions/Alterations',
        work: 'Addition(s)',
        structure_type: 'SFD - Detached',
        proposed_use: 'Residential',
        description: 'Two storey rear addition',
      }));
      expect(result.scope_tags).toContain('new:2-storey-addition');
    });

    it('non-residential A/A → uses general tags', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Building Additions/Alterations',
        work: 'Interior Alterations',
        structure_type: 'Office',
        proposed_use: 'Commercial',
        description: 'Tenant fitout for new office space',
      }));
      expect(result.scope_tags).toContain('tenant-fitout');
      expect(result.scope_tags).toContain('office');
      expect(result.scope_tags.some(t => t.startsWith('new:'))).toBe(false);
    });

    it('residential A/A with laneway suite → residential tag system', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Building Additions/Alterations',
        work: 'New Laneway / Rear Yard Suite',
        structure_type: 'SFD - Detached',
        proposed_use: 'Residential',
        description: 'Construct new laneway suite',
      }));
      expect(result.scope_tags).toContain('new:laneway-suite');
    });

    it('residential A/A with garden suite → laneway-suite tag', () => {
      const result = classifyScope(createMockPermit({
        permit_type: 'Building Additions/Alterations',
        work: 'New Laneway / Rear Yard Suite',
        structure_type: 'SFD - Detached',
        proposed_use: 'Residential',
        description: 'Construct new garden suite in rear yard',
      }));
      expect(result.scope_tags).toContain('new:laneway-suite');
    });
  });
});

// ---------------------------------------------------------------------------
// extractBasePermitNum
// ---------------------------------------------------------------------------

describe('extractBasePermitNum', () => {
  it('extracts base from BLD permit', () => {
    expect(extractBasePermitNum('21 123456 BLD 00')).toBe('21 123456');
  });

  it('extracts base from PLB permit', () => {
    expect(extractBasePermitNum('21 123456 PLB 00')).toBe('21 123456');
  });

  it('extracts base from HVA permit', () => {
    expect(extractBasePermitNum('24 987654 HVA 00')).toBe('24 987654');
  });

  it('extracts base from DRN permit', () => {
    expect(extractBasePermitNum('21 123456 DRN 00')).toBe('21 123456');
  });

  it('extracts base from DEM permit', () => {
    expect(extractBasePermitNum('21 123456 DEM 00')).toBe('21 123456');
  });

  it('handles permit with no code (already the base)', () => {
    expect(extractBasePermitNum('24 101234')).toBe('24 101234');
  });

  it('handles leading/trailing whitespace', () => {
    expect(extractBasePermitNum('  21 123456 BLD 00  ')).toBe('21 123456');
  });

  it('handles multiple spaces between parts', () => {
    expect(extractBasePermitNum('21  123456  BLD  00')).toBe('21 123456');
  });
});

// ---------------------------------------------------------------------------
// isBLDPermit
// ---------------------------------------------------------------------------

describe('isBLDPermit', () => {
  it('returns true for BLD permit', () => {
    expect(isBLDPermit('21 123456 BLD 00')).toBe(true);
  });

  it('returns false for PLB permit', () => {
    expect(isBLDPermit('21 123456 PLB 00')).toBe(false);
  });

  it('returns false for HVA permit', () => {
    expect(isBLDPermit('21 123456 HVA 00')).toBe(false);
  });

  it('returns false for DRN permit', () => {
    expect(isBLDPermit('21 123456 DRN 00')).toBe(false);
  });

  it('returns false for DEM permit', () => {
    expect(isBLDPermit('21 123456 DEM 00')).toBe(false);
  });

  it('returns false for permit with no code', () => {
    expect(isBLDPermit('24 101234')).toBe(false);
  });

  it('returns true for BLD at end without revision', () => {
    expect(isBLDPermit('21 123456 BLD')).toBe(true);
  });

  it('handles leading/trailing whitespace', () => {
    expect(isBLDPermit('  21 123456 BLD 00  ')).toBe(true);
  });

  it('does not match BLDG or similar substrings', () => {
    // Only matches exact " BLD " or " BLD" at end
    expect(isBLDPermit('21 123456 BLDX 00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Accuracy Improvement Tests (Target: >4.5 composite)
// ---------------------------------------------------------------------------

describe('Fix 1: Regex blacklisting — addition-of false positives', () => {
  const srp = (overrides: Partial<Parameters<typeof createMockPermit>[0]>) =>
    createMockPermit({ permit_type: 'Small Residential Projects', ...overrides });

  it('"addition of a new washroom" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      work: 'Interior Alterations',
      description: 'Proposal for addition of a new washroom in basement',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
    expect(tags).toContain('new:bathroom');
  });

  it('"addition of laundry" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      work: 'Interior Alterations',
      description: 'Interior alterations for addition of laundry facility',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
    expect(tags).toContain('new:laundry');
  });

  it('"addition of a closet" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      description: 'Renovation including addition of closet space',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
  });

  it('"addition of shower" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      description: 'Interior alterations for addition of shower in basement',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
  });

  it('"addition of a new door" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      description: 'Interior alterations for addition of a new door opening',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
  });

  it('"addition of a window" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      description: 'Interior alterations for addition of a window',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
  });

  it('"addition of fireplace" does NOT trigger storey-addition', () => {
    const tags = extractResidentialTags(srp({
      description: 'Interior alterations for addition of fireplace',
    }));
    expect(tags).not.toContain('new:1-storey-addition');
    expect(tags).toContain('new:fireplace');
  });

  it('"rear addition" still triggers storey-addition (structural)', () => {
    const tags = extractResidentialTags(srp({
      description: 'Construct rear addition with new deck',
    }));
    expect(tags).toContain('new:1-storey-addition');
  });

  it('work="Addition(s)" still triggers storey-addition regardless of description', () => {
    const tags = extractResidentialTags(srp({
      work: 'Addition(s)',
      description: 'Addition of new washroom and closet',
    }));
    expect(tags).toContain('new:1-storey-addition');
  });
});

describe('Fix 2: Zero-tag coverage — station and storage tags', () => {
  it('"pumping station" → station tag', () => {
    const tags = extractScopeTags(createMockPermit({
      description: 'Alterations to existing pumping station',
    }));
    expect(tags).toContain('station');
  });

  it('"transit station" → station tag', () => {
    const tags = extractScopeTags(createMockPermit({
      description: 'New transit station entrance modifications',
    }));
    expect(tags).toContain('station');
  });

  it('"storage" → storage tag', () => {
    const tags = extractScopeTags(createMockPermit({
      description: 'Install new storage racking system',
    }));
    expect(tags).toContain('storage');
  });

  it('"racking" → storage tag', () => {
    const tags = extractScopeTags(createMockPermit({
      description: 'Racking system for warehouse',
    }));
    expect(tags).toContain('storage');
  });
});

describe('Fix 5: Use-type classification — universal tier', () => {
  it('Small Residential → residential', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Small Residential Projects',
    }))).toBe('residential');
  });

  it('New Houses → residential', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'New Houses',
    }))).toBe('residential');
  });

  it('structure_type=SFD → residential', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Building Additions/Alterations',
      structure_type: 'SFD - Detached',
    }))).toBe('residential');
  });

  it('proposed_use=dwelling → residential', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Building Additions/Alterations',
      proposed_use: 'Single family dwelling',
    }))).toBe('residential');
  });

  it('Non-Residential Building Permit → commercial', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Non-Residential Building Permit',
      structure_type: 'Office Building',
      proposed_use: 'Office',
      current_use: 'Office',
    }))).toBe('commercial');
  });

  it('proposed_use=office → commercial', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Building Additions/Alterations',
      structure_type: 'Office Building',
      proposed_use: 'Office',
      current_use: 'Office',
    }))).toBe('commercial');
  });

  it('proposed_use=retail → commercial', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Building Additions/Alterations',
      structure_type: 'Store',
      proposed_use: 'Retail store',
      current_use: 'Retail',
    }))).toBe('commercial');
  });

  it('structure_type=commercial → commercial', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Building Additions/Alterations',
      structure_type: 'Commercial building',
      proposed_use: 'Commercial',
      current_use: 'Commercial',
    }))).toBe('commercial');
  });

  it('residential + commercial signals → mixed-use', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Small Residential Projects',
      proposed_use: 'Retail on ground floor',
    }))).toBe('mixed-use');
  });

  it('no clear signal defaults to commercial', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Fire/Security Upgrade',
      structure_type: '',
      proposed_use: '',
      current_use: '',
    }))).toBe('commercial');
  });

  it('Plumbing(PS) with no structure info → commercial (default)', () => {
    expect(classifyUseType(createMockPermit({
      permit_type: 'Plumbing(PS)',
      structure_type: '',
      proposed_use: '',
      current_use: '',
    }))).toBe('commercial');
  });

  it('use-type is included in classifyScope output for SRP', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Small Residential Projects',
      description: 'Build new deck',
    }));
    expect(result.scope_tags).toContain('residential');
    expect(result.scope_tags).toContain('new:deck');
  });

  it('use-type is included in classifyScope output for general permit', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Non-Residential Building Permit',
      description: 'Office renovation',
      proposed_use: 'Office',
    }));
    expect(result.scope_tags).toContain('commercial');
    expect(result.scope_tags).toContain('office');
  });

  it('use-type is included in classifyScope output for New Houses', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'New Houses',
      description: 'Construct new SFD with garage',
      structure_type: 'SFD - Detached',
    }));
    expect(result.scope_tags).toContain('residential');
    expect(result.scope_tags).toContain('new:sfd');
  });
});

describe('Demolition tag — all DM permits', () => {
  it('Demolition Folder (DM) gets demolition tag', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Demolition Folder (DM)',
      work: 'Demolition',
      description: 'Demolish existing 2 storey dwelling',
      structure_type: 'SFD - Detached',
    }));
    expect(result.project_type).toBe('demolition');
    expect(result.scope_tags).toContain('demolition');
    expect(result.scope_tags).toContain('residential');
  });

  it('DM permit with no description still gets demolition tag', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Demolition Folder (DM)',
      work: 'Demolition',
      description: '',
      structure_type: '',
      proposed_use: '',
      current_use: '',
    }));
    expect(result.project_type).toBe('demolition');
    expect(result.scope_tags).toContain('demolition');
  });

  it('DM commercial permit gets both demolition and commercial', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Demolition Folder (DM)',
      work: 'Demolition',
      description: 'Demolish commercial building',
      structure_type: 'Commercial building',
      proposed_use: 'Commercial',
      current_use: 'Commercial',
    }));
    expect(result.scope_tags).toContain('demolition');
    expect(result.scope_tags).toContain('commercial');
  });

  it('DM permit with new_build project_type still gets demolition tag', () => {
    const result = classifyScope(createMockPermit({
      permit_type: 'Demolition Folder (DM)',
      work: 'Demolition',
      description: 'Demolish existing SFD and construct new SFD',
      structure_type: 'SFD - Detached',
    }));
    expect(result.scope_tags).toContain('demolition');
    expect(result.scope_tags).toContain('residential');
  });
});
