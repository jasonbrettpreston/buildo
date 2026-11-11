// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.4 dated note 2026-11-11 (MF-48 D-3 a: the existing @gorhom/bottom-sheet,
//            held by the screen host), §11b.2 dated note 2026-11-11 (D-2 a: owner binding_mobile_report), docs/specs/03-mobile/99_mobile_state_architecture.md
//            (ephemeral UI state stays local; never persisted), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-31 (C-8m host list).
//
// MF-48 · the mobile REPORT screen host (Stage A: mounted nowhere; Stage B mounts it on the parcel screen once MB-44 serves a page view). It holds
// the screen-local UI state of the v21 page (which details panel is open per option, How? per option, the sheet) and the existing bottom sheet, and
// renders the page and the sheet body through the ONE shared renderer. It holds no text, value or layout decision of its own: the trees come from
// ReportBinding.tsx, the texts from the page view and the content strings the screen passes in. Every element comes through its COMPONENTS table
// (bindings.json mapping.mobile.REPORT_HOST; FE-31 C-8m host list). The sheet is driven by its `index` prop (gorhom 5 snaps when it changes):
// open = 0, closed = -1; a swipe down or a tap on the backdrop calls onClose. Panel state starts closed on every visit (web parity).
import * as React from 'react';
import { View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { SurfaceRenderer, type ReportActions, type SurfaceTree } from '@/components/surfaces/SurfaceRenderer';
import { lifecycleProps, reportProps, REPORT_UI_CLOSED, type LifecycleState, type PageView, type ReportUi } from '@/components/surfaces/ReportBinding';
import { REPORT_HEX as H, REPORT_PAGE_LAYOUT as L } from '@/constants/reportPage';

const COMPONENTS = { View, SurfaceRenderer, BottomSheet, BottomSheetView, BottomSheetBackdrop };
const NO_DATA = { contract: {}, derived: {} };

/** The pure state changes of the host's UI (exported for the behaviour test). One panel open per option; the same opener closes it. */
export const REPORT_UI = {
  togglePanel: (u: ReportUi, option: string, panel: 'size' | 'cost'): ReportUi => ({ ...u, panel: { ...u.panel, [option]: u.panel[option] === panel ? null : panel } }),
  toggleHow: (u: ReportUi, option: string): ReportUi => ({ ...u, how: { ...u.how, [option]: u.how[option] !== true } }),
};

export function ReportPageHost({ view, lifecycle, content }: { view: PageView | null; lifecycle: LifecycleState; content: Record<string, string> }) {
  const [ui, setUi] = React.useState<ReportUi>(REPORT_UI_CLOSED);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const Box = COMPONENTS['View'];
  const Renderer = COMPONENTS['SurfaceRenderer'];
  const Sheet = COMPONENTS['BottomSheet'];
  const SheetBody = COMPONENTS['BottomSheetView'];
  const Backdrop = COMPONENTS['BottomSheetBackdrop'];
  const actions: ReportActions = {
    toggle_panel: (option, panel) => setUi((u) => REPORT_UI.togglePanel(u, option, panel)),
    toggle_how: (option) => setUi((u) => REPORT_UI.toggleHow(u, option)),
    open_sheet: () => setSheetOpen(true),
    close_sheet: () => setSheetOpen(false),
  };
  const backdrop = React.useCallback((p: BottomSheetBackdropProps) => <Backdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />, [Backdrop]);
  if (view === null) return <Renderer tree={lifecycleProps(lifecycle) as SurfaceTree} content={content} data={NO_DATA} actions={actions} />;
  const trees = reportProps(view, ui);
  const data = { ...NO_DATA, page: view };
  return (
    <Box className={L.host} testID="report-host">
      <Renderer tree={trees.page as SurfaceTree} content={content} data={data} actions={actions} />
      {trees.sheet ? (
        <Sheet
          index={sheetOpen ? 0 : -1}
          enablePanDownToClose
          onClose={actions.close_sheet}
          backdropComponent={backdrop}
          backgroundStyle={{ backgroundColor: H.inner }}
          handleIndicatorStyle={{ backgroundColor: H.buttonBorder }}
        >
          <SheetBody>
            <Renderer tree={trees.sheet as SurfaceTree} content={content} data={data} actions={actions} />
          </SheetBody>
        </Sheet>
      ) : null}
    </Box>
  );
}
