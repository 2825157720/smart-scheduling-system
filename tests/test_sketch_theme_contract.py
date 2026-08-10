from __future__ import annotations

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "static" / "index.html"
THEME_PATH = ROOT / "static" / "sketch-theme.css"
HEADERS_PATH = ROOT / "static" / "_headers"
FONTS_PATH = ROOT / "static" / "fonts"


def _relative_luminance(hex_color: str) -> float:
    channels = [
        int(hex_color[index:index + 2], 16) / 255
        for index in (1, 3, 5)
    ]
    linear = [
        channel / 12.92
        if channel <= 0.04045
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast_ratio(first: str, second: str) -> float:
    first_luminance = _relative_luminance(first)
    second_luminance = _relative_luminance(second)
    lighter = max(first_luminance, second_luminance)
    darker = min(first_luminance, second_luminance)
    return (lighter + 0.05) / (darker + 0.05)


class _StartTagIndex(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.by_id: dict[str, tuple[str, dict[str, str | None]]] = {}
        self.tags: list[tuple[str, dict[str, str | None]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        self.tags.append((tag, attributes))
        element_id = attributes.get("id")
        if element_id:
            self.by_id[element_id] = (tag, attributes)


class SketchThemeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = INDEX_PATH.read_text(encoding="utf-8")
        cls.theme = THEME_PATH.read_text(encoding="utf-8") if THEME_PATH.exists() else ""
        cls.headers = HEADERS_PATH.read_text(encoding="utf-8")
        cls.parser = _StartTagIndex()
        cls.parser.feed(cls.index)

    def test_theme_file_exists_and_is_the_only_page_stylesheet(self) -> None:
        self.assertTrue(THEME_PATH.is_file())
        self.assertIn('<link rel="stylesheet" href="/sketch-theme.css">', self.index)
        self.assertNotRegex(self.index, r"<style(?:\s|>)")

    def test_semantic_tokens_and_four_wobbly_presets(self) -> None:
        expected_tokens = {
            "--paper": "#F6F0E4",
            "--paper-card": "#FFFDF7",
            "--ink": "#252522",
            "--ink-muted": "#595750",
            "--marker-red": "#C7363E",
            "--pen-blue": "#2358A5",
            "--sticky-yellow": "#FFF1A8",
            "--status-on-bg": "#DDEEDC",
            "--status-on-fg": "#245C34",
            "--status-group-bg": "#DCEAF8",
            "--status-group-fg": "#204E7C",
            "--status-off-bg": "#F8DADB",
            "--status-off-fg": "#862831",
            "--status-sub-bg": "#F8E0B8",
            "--status-sub-fg": "#7A4312",
            "--status-pending-bg": "#E7DDF2",
            "--status-pending-fg": "#5A3B73",
            "--status-past-bg": "#E9E4DA",
            "--status-past-fg": "#5F5B54",
        }
        for token, value in expected_tokens.items():
            with self.subTest(token=token):
                self.assertRegex(self.theme, rf"{re.escape(token)}\s*:\s*{re.escape(value)}\s*;")

        wobble_values = [
            "12px 8px 14px 7px / 8px 13px 7px 12px",
            "8px 14px 7px 12px / 13px 8px 12px 7px",
            "14px 7px 11px 9px / 7px 12px 8px 14px",
            "9px 12px 8px 14px / 12px 7px 14px 9px",
        ]
        for index, value in enumerate(wobble_values, start=1):
            with self.subTest(wobble=index):
                self.assertIn(f"--wobbly-{index}: {value};", self.theme)

        self.assertIn("4px 4px 0 var(--ink)", self.theme)
        self.assertIn("2px 2px 0 var(--ink)", self.theme)
        self.assertIn("background-size: 20px 20px", self.theme)
        self.assertNotRegex(self.theme, r"(?<!-)filter\s*:")
        self.assertNotIn("backdrop-filter", self.theme)

    def test_fonts_are_versioned_local_woff2_assets_without_external_requests(self) -> None:
        expected_css_paths = [
            "/fonts/kalam/5.3.0/kalam-latin-400-normal.95441060.woff2",
            "/fonts/patrick-hand/5.3.0/patrick-hand-latin-400-normal.ac5bc903.woff2",
            "/fonts/lxgw-wenkai-screen/1.522.0/lxgw-wenkai-screen.css",
        ]
        for css_path in expected_css_paths:
            with self.subTest(css_path=css_path):
                self.assertIn(css_path, self.theme)
                self.assertTrue((ROOT / "static" / css_path.lstrip("/")).is_file())

        lxgw_css = (
            FONTS_PATH
            / "lxgw-wenkai-screen"
            / "1.522.0"
            / "lxgw-wenkai-screen.css"
        ).read_text(encoding="utf-8")
        self.assertEqual(lxgw_css.count("@font-face"), 244)
        self.assertEqual(lxgw_css.count("font-display:swap"), 244)
        self.assertEqual(len(list(FONTS_PATH.rglob("*.woff2"))), 246)
        self.assertTrue((FONTS_PATH / "SHA256SUMS.txt").is_file())

        all_frontend_text = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in (ROOT / "static").rglob("*")
            if path.is_file() and path.suffix.lower() in {".html", ".css", ".js"}
        )
        for external_host in ("fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net"):
            self.assertNotIn(external_host, all_frontend_text)
        self.assertNotRegex(self.theme, r"url\(\s*['\"]?https?://")

    def test_focus_breakpoints_and_reduced_motion(self) -> None:
        self.assertRegex(self.theme, r":focus-visible\s*\{[^}]*outline:\s*3px solid var\(--pen-blue\)")
        for breakpoint in ("1199px", "899px", "639px"):
            with self.subTest(breakpoint=breakpoint):
                self.assertIn(f"@media (max-width: {breakpoint})", self.theme)
        self.assertIn("@media (pointer: coarse)", self.theme)
        self.assertIn("@media (prefers-reduced-motion: reduce)", self.theme)
        self.assertIn("min-width: 44px", self.theme)
        self.assertIn("min-height: 44px", self.theme)

    def test_schedule_grid_uses_fixed_columns_and_equal_cell_slots(self) -> None:
        expected_widths = {
            "--schedule-position-width": "108px",
            "--schedule-default-width": "72px",
            "--schedule-workload-width": "48px",
            "--schedule-day-width": "56px",
        }
        for token, value in expected_widths.items():
            with self.subTest(token=token):
                self.assertIn(f"{token}: {value};", self.theme)

        table_block = re.search(r"#schedule-table\s*\{(?P<body>[^}]*)\}", self.theme)
        self.assertIsNotNone(table_block)
        self.assertIn("width: max-content;", table_block.group("body"))
        self.assertIn("min-width: 0;", table_block.group("body"))
        self.assertNotIn("min-width: 100%;", table_block.group("body"))

        self.assertRegex(
            self.theme,
            r"\.col-day\s*\{[^}]*width:\s*var\(--schedule-day-width\);"
            r"[^}]*min-width:\s*var\(--schedule-day-width\);"
            r"[^}]*max-width:\s*var\(--schedule-day-width\);",
        )
        self.assertRegex(self.theme, r"\.cell\s*\{[^}]*width:\s*100%;")
        self.assertRegex(
            self.theme,
            r"\.split-slot\s*\{[^}]*flex:\s*0 0 50%;[^}]*width:\s*50%;",
        )

    def test_schedule_names_are_complete_and_split_slots_keep_semantics(self) -> None:
        split_display = re.search(
            r"function getSplitSlotDisplay\(.*?\n\}",
            self.index,
            re.DOTALL,
        )
        self.assertIsNotNone(split_display)
        self.assertNotIn("shortPersonName", split_display.group(0))
        self.assertNotRegex(split_display.group(0), r"\.slice\(\s*0\s*,\s*2\s*\)")
        self.assertNotIn("function shortPersonName", self.index)
        self.assertNotIn('<span class="slot-label">', self.index)
        self.assertIn('<span class="sr-only">${safeTitle}</span>', self.index)
        self.assertIn('class="slot-person" aria-hidden="true"', self.index)
        self.assertIn("syncScheduleDayWidth(days, hidden);", self.index)
        self.assertRegex(self.theme, r"\.split-slot\s*\{[^}]*font-size:\s*10px;")

        for selector in (r"\.cell\s*", r"\.split-slot \.slot-person\s*"):
            with self.subTest(selector=selector):
                block = re.search(selector + r"\{(?P<body>[^}]*)\}", self.theme)
                self.assertIsNotNone(block)
                self.assertNotIn("text-overflow: ellipsis", block.group("body"))

    def test_text_and_status_color_pairs_meet_wcag_aa_contrast(self) -> None:
        color_pairs = {
            "body": ("#F6F0E4", "#252522"),
            "muted-body": ("#F6F0E4", "#595750"),
            "primary-button": ("#C7363E", "#FFFDF7"),
            "information-button": ("#2358A5", "#FFFDF7"),
            "on": ("#DDEEDC", "#245C34"),
            "group": ("#DCEAF8", "#204E7C"),
            "off": ("#F8DADB", "#862831"),
            "substitute": ("#F8E0B8", "#7A4312"),
            "pending": ("#E7DDF2", "#5A3B73"),
            "past": ("#E9E4DA", "#5F5B54"),
        }
        for name, (background, foreground) in color_pairs.items():
            with self.subTest(pair=name):
                self.assertGreaterEqual(
                    _contrast_ratio(background, foreground),
                    4.5,
                )

    def test_headers_revalidate_app_shell_and_cache_only_versioned_fonts_immutably(self) -> None:
        self.assertIn("/sketch-theme.css\n  Cache-Control: public, max-age=0, must-revalidate", self.headers)
        self.assertIn("/schedule-import.js\n  Cache-Control: public, max-age=0, must-revalidate", self.headers)
        for versioned_prefix in (
            "/fonts/kalam/5.3.0/*",
            "/fonts/patrick-hand/5.3.0/*",
            "/fonts/lxgw-wenkai-screen/1.522.0/*",
        ):
            with self.subTest(prefix=versioned_prefix):
                self.assertIn(
                    f"{versioned_prefix}\n  Cache-Control: public, max-age=31536000, immutable",
                    self.headers,
                )
        global_header_block = self.headers.split("\n\n", 1)[0]
        self.assertNotIn("immutable", global_header_block)
        self.assertIn("Content-Security-Policy", self.headers)

    def test_critical_dom_ids_and_handlers_remain(self) -> None:
        critical_ids = {
            "topbar", "sel-year", "sel-month", "schedule-area", "schedule-table",
            "tbl-head", "tbl-body", "side-panel", "memo-panel", "memo-text",
            "day-plan-modal", "schedule-import-modal", "col-settings-modal",
            "mgr-modal", "group-modal", "staff-modal", "pos-modal", "ctx-menu",
            "toast", "loading",
        }
        self.assertTrue(critical_ids.issubset(self.parser.by_id))

        critical_handlers = {
            "openMgr()", "resetSchedule()", "openDayPlanModal()",
            "openScheduleImportModal()", "openColSettings()", "backupSchedule()",
            "restoreBackup()", "toggleMemoEdit()", "saveMemo()", "cancelMemoEdit()",
            "runDayPlan()", "applyScheduleImport()", "applyColSettings()",
        }
        for handler in critical_handlers:
            with self.subTest(handler=handler):
                self.assertIn(handler, self.index)

    def test_all_modals_are_labeled_dialogs_with_button_close(self) -> None:
        modal_labels = {
            "day-plan-modal": "day-plan-title",
            "schedule-import-modal": "schedule-import-title",
            "col-settings-modal": "col-settings-title",
            "mgr-modal": "mgr-title",
            "group-modal": "group-modal-title",
            "staff-modal": "staff-modal-title",
            "pos-modal": "pos-modal-title",
        }
        for modal_id, title_id in modal_labels.items():
            with self.subTest(modal=modal_id):
                tag, attrs = self.parser.by_id[modal_id]
                self.assertEqual(tag, "div")
                self.assertEqual(attrs.get("role"), "dialog")
                self.assertEqual(attrs.get("aria-modal"), "true")
                self.assertEqual(attrs.get("aria-labelledby"), title_id)
                self.assertIn(title_id, self.parser.by_id)

        close_buttons = [
            attrs
            for tag, attrs in self.parser.tags
            if tag == "button" and "modal-close" in (attrs.get("class") or "").split()
        ]
        self.assertEqual(len(close_buttons), 7)
        self.assertTrue(all(attrs.get("type") == "button" for attrs in close_buttons))
        self.assertTrue(all(attrs.get("aria-label") for attrs in close_buttons))
        self.assertNotIn('<span class="modal-close"', self.index)

    def test_side_and_manager_tabs_are_semantic_buttons(self) -> None:
        for tab_class, count in (("side-tab", 4), ("mgr-tab", 3)):
            matching = [
                attrs
                for tag, attrs in self.parser.tags
                if tag == "button" and tab_class in (attrs.get("class") or "").split()
            ]
            self.assertEqual(len(matching), count)
            self.assertTrue(all(attrs.get("type") == "button" for attrs in matching))
            self.assertNotRegex(self.index, rf'<div class="[^"]*\b{tab_class}\b')

    def test_user_visible_toasts_have_exact_copy(self) -> None:
        expected_copy = (
            "加载失败：",
            "岗位顺序已保存",
            "保存顺序失败：",
            "级联更新：已自动替换 ${cascadeCount} 个受影响岗位",
        )
        for copy in expected_copy:
            with self.subTest(copy=copy):
                self.assertIn(copy, self.index)

    def test_file_protocol_uses_worker_port_3001(self) -> None:
        self.assertIn(
            "location.protocol === 'file:' ? 'http://127.0.0.1:3001' : ''",
            self.index,
        )
        self.assertNotIn("http://127.0.0.1:3000", self.index)


if __name__ == "__main__":
    unittest.main()
