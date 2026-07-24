import unittest
from pathlib import Path


class FrontendSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = Path("static/index.html").read_text(encoding="utf-8")

    def _block(self, start_marker, end_marker):
        start = self.text.index(start_marker)
        end = self.text.index(end_marker, start)
        return self.text[start:end]

    def test_group_table_uses_member_names(self):
        block = self._block("async function renderGroupTable(){", "function showAddGroup(){")
        self.assertIn("g.member_names ||", block)
        self.assertNotIn("staff.filter(s => s.group_id === g.id).map(s => s.name);", block)

    def test_group_picker_still_uses_group_id(self):
        block = self._block("function buildGroupMembersSel(groupId){", "function closeGroupModal(){")
        self.assertIn("group_id === groupId", block)

    def test_group_activity_helper_uses_member_names(self):
        block = self._block("function getGroupActiveMembers(group, dayData){", "function calcDayWorkload(day){")
        self.assertIn("group.member_names ||", block)

    def test_day_plan_ui_exists(self):
        self.assertIn("\u5f53\u5929\u6392\u73ed", self.text)
        self.assertIn("day-plan-modal", self.text)
        self.assertIn("day-plan-day", self.text)
        self.assertIn("day-plan-off-list", self.text)
        self.assertIn("day-plan-scatter", self.text)
        self.assertIn("openDayPlanModal", self.text)
        self.assertIn("runDayPlan", self.text)
        self.assertIn("\u53f3\u952e\u81ea\u5b9a\u4e49\u66ff\u73ed", self.text)
        block = self._block('id="day-plan-modal"', "<!-- 导入排休 -->")
        self.assertIn("兼顾本月截至前一天的替班工作量", block)
        self.assertIn("候选单日工作量容差 2 点", block)
        self.assertIn("优先避免连续两天由同一人替班", block)

    def test_schedule_import_ui_and_local_parser_exist(self):
        self.assertIn("导入排休", self.text)
        self.assertIn("schedule-import-modal", self.text)
        self.assertIn("schedule-import-file", self.text)
        self.assertIn("schedule-import-password", self.text)
        self.assertIn("/vendor/xlsx.full.min.js", self.text)
        self.assertIn("/schedule-import.js", self.text)
        self.assertIn("import-off-days", self.text)
        self.assertIn("今天之后", self.text)
        self.assertIn("全天智能排班", self.text)
        self.assertIn("门店表示出差", self.text)
        block = self._block('id="schedule-import-modal"', 'id="col-settings-modal"')
        self.assertIn("兼顾本月截至前一天的替班工作量", block)
        self.assertIn("候选单日工作量容差 2 点", block)
        self.assertIn("优先避免连续两天由同一人替班", block)

    def test_reset_schedule_preserves_today_and_history(self):
        block = self._block("async function resetSchedule(){", "async function backupSchedule(){")
        self.assertIn("今天和历史日期保持不变", block)
        self.assertIn("reset_dates", block)

    def test_position_save_immediately_refreshes_schedule_and_statistics(self):
        block = self._block("async function savePos(){", "async function delPos(id,name){")

        self.assertIn("Promise.all", block)
        self.assertIn("api(`/api/schedule/${G.year}/${G.month}`)", block)
        self.assertIn("renderDayStat()", block)
        self.assertIn("renderWeekStat()", block)
        self.assertIn("renderMonthStat()", block)

    def test_day_plan_day_selector_uses_current_month(self):
        block = self._block("function buildDayPlanDaySel(){", "function openDayPlanModal(){")
        self.assertIn("daysInMonth(G.year,G.month)", block)
        self.assertIn("day-plan-day", block)

    def test_day_plan_submits_staff_ids(self):
        block = self._block("function renderDayPlanOffList(){", "async function loadAll(){")
        self.assertIn("value=\"' + m.id + '\"", block)
        self.assertIn("off_person_ids", self.text)
        self.assertIn("use_saved_off_persons", self.text)
        self.assertIn("dayPlanDirty", self.text)
        self.assertIn("scatter_groups", self.text)

    def test_day_plan_scatter_defaults_to_weekend(self):
        block = self._block("function isDayPlanScatterDefault(day){", "function updateMemoMeta(text){")
        self.assertIn("getDay()", block)
        self.assertIn("wd === 5", block)
        self.assertIn("wd === 6", block)
        self.assertIn("wd === 0", block)

    def test_position_modal_supports_split_toggle(self):
        self.assertIn("pos-split", self.text)
        self.assertIn("split_allowed", self.text)
        self.assertIn("\u53cc\u69fd\u4f4d", self.text)

    def test_day_plan_off_list_treats_active_members_as_available(self):
        block = self._block("function getOffPersonsOnDay(day){", "function isPersonOffOnDay(name, day){")
        self.assertIn("status === 'on'", block)
        self.assertIn("status === 'substitute'", block)
        self.assertIn("status === 'off'", block)

    def test_split_cells_have_separate_slots(self):
        self.assertIn("split-slot", self.text)
        self.assertIn("slot-am", self.text)
        self.assertIn("slot-pm", self.text)
        self.assertIn("toggleCellSplit", self.text)
        style_block = self._block(".cell-split{", ".cell-weekend-week{")
        self.assertIn("flex-direction:row", style_block)
        self.assertIn("border-right:1px solid rgba(255,255,255,.4)", style_block)
        self.assertNotIn("border-bottom:1px solid rgba(255,255,255,.4)", style_block)

    def test_schedule_cells_use_right_click_only(self):
        block = self._block("function bindScheduleCellEvents(root){", "function getPersonGroup(name)")
        self.assertIn("addEventListener('contextmenu', onCellRightClick)", block)
        self.assertNotIn("addEventListener('click'", block)

    def test_split_slot_right_click_restore_checks_off_day_guard(self):
        right_click_block = self._block("function onCellRightClick(e){", "function onSplitSlotClick")
        restore_block = self._block("async function ctxRestoreDefault(pid, day, slot=''){", "async function ctxSetSub")

        self.assertIn("isPersonOffOnDay", right_click_block)
        self.assertIn("isPersonOffOnDay", restore_block)


if __name__ == "__main__":
    unittest.main()
