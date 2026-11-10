'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (mount file), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31
//            (a mount file imports only framework packages, binding modules and project-internal paths; it holds no display text).
//
// MF-40 · the client mount of admin_placements (the offer FORM), admin_offers (the LIST: edit opens the offer FORM in the Modal, toggle_active
// turns an offer on or off) and admin_advertiser_entry (the advertiser FORM): the two bindings and the three write hooks, nothing else. A new
// offer or advertiser gets a page-generated id (idempotent create); an edit sends the updated_at the list read (409 when stale).
import { useState } from 'react';
import { FormBinding, formTree, type FormState } from '@/components/surfaces/web/FormBinding';
import { ListBinding, listTree, type ListState, type Row } from '@/components/surfaces/web/ListBinding';
import type { AdvertiserBody, OfferBody } from '@/lib/placements/contract';
import type { PlacementsRead } from '@/lib/placements/list';
import { PLACEMENTS_CONTENT, PLACEMENTS_SCHEMAS, PLACEMENTS_SURFACES } from '@/lib/placements/surfaces';
import { useAddAdvertiser, useSaveOffer, useToggleOffer } from '@/lib/placements/usePlacementWrites';

type FormDescriptor = Parameters<typeof formTree>[0];
type FormSchema = Parameters<typeof formTree>[1];
type ListDescriptor = Parameters<typeof listTree>[0];

const formStateOf = (m: { isPending: boolean; isError: boolean; isSuccess: boolean }): FormState =>
  m.isPending ? 'loading' : m.isError ? 'error' : m.isSuccess ? 'hit' : 'static';
/** The offer form's values from a list row (an edit), dropping the empty optional fields the schema would refuse as null. */
const offerOf = (row: Row): Record<string, unknown> =>
  Object.fromEntries(['offer_id', 'updated_at', 'placement_key', 'advertiser_id', 'building_type', 'design_option', 'creative_text', 'flight_start', 'flight_end']
    .flatMap((k) => (row[k] === null || row[k] === undefined ? [] : [[k, row[k]]])));

export function PlacementsPageClient({ read, state }: { read: PlacementsRead; state: ListState }) {
  const save = useSaveOffer({ errorText: PLACEMENTS_CONTENT['admin_placements.state.error'] as string });
  const toggle = useToggleOffer({ errorText: PLACEMENTS_CONTENT['admin_offers.state.error'] as string, warnText: PLACEMENTS_CONTENT['admin_offers.col.over_cap.option.true'] as string });
  const add = useAddAdvertiser({ errorText: PLACEMENTS_CONTENT['admin_advertiser_entry.state.error'] as string });
  const [offerId, setOfferId] = useState(() => crypto.randomUUID());
  const [advertiserId, setAdvertiserId] = useState(() => crypto.randomUUID());
  const offer = PLACEMENTS_SURFACES.offer as unknown as FormDescriptor;
  const offerSchema = PLACEMENTS_SCHEMAS.offer as FormSchema;
  const options = { advertiser_id: read.advertisers as unknown as Array<Record<string, unknown>> };
  const list = PLACEMENTS_SURFACES.list as unknown as ListDescriptor;
  const rows = read.offers as unknown as Row[];
  const offerForm = (values: Record<string, unknown>, onSaved: () => void) => (
    <FormBinding
      tree={formTree(offer, offerSchema, formStateOf(save))}
      schema={offerSchema}
      content={PLACEMENTS_CONTENT}
      runtime={{ formData: values, options, disabled: save.isPending, onSubmit: (data) => save.mutate(data as unknown as OfferBody, { onSuccess: onSaved }) }}
    />
  );
  return (
    <>
      {offerForm({ offer_id: offerId, ...read.defaults }, () => setOfferId(crypto.randomUUID()))}
      <FormBinding
        tree={formTree(PLACEMENTS_SURFACES.advertiser as unknown as FormDescriptor, PLACEMENTS_SCHEMAS.advertiser as FormSchema, formStateOf(add))}
        schema={PLACEMENTS_SCHEMAS.advertiser as FormSchema}
        content={PLACEMENTS_CONTENT}
        runtime={{
          formData: { advertiser_id: advertiserId },
          disabled: add.isPending,
          onSubmit: (data) => add.mutate(data as unknown as AdvertiserBody, { onSuccess: () => setAdvertiserId(crypto.randomUUID()) }),
        }}
      />
      <ListBinding
        descriptor={list}
        tree={listTree(list, state)}
        rows={rows}
        content={PLACEMENTS_CONTENT}
        onAction={(row, kind) => {
          if (kind === 'toggle_active') toggle.mutate({ offer_id: String(row.offer_id), updated_at: String(row.updated_at), active: row.active !== 'true' });
        }}
        actionForm={(row, close) => offerForm(offerOf(row), close)}
      />
    </>
  );
}
