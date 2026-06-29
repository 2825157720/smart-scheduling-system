from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent
INDEX_HTML = BASE_DIR / "static" / "index.html"

HELPER_FUNCTIONS = """
// ==============================
//  group full-off auto substitute
// ==============================

/**
 * Get the group a person belongs to through staff[n].group_id.
 */
function getPersonGroup(name) {
  const person = G.staff.find(s => s.name === name);
  if (!person || !person.group_id) return null;
  return G.groups.find(g => g.id === person.group_id) || null;
}

/**
 * Get all member names for a group.
 */
function getGroupMemberNames(group) {
  if (!group) return [];
  return G.staff.filter(s => s.group_id === group.id).map(s => s.name);
}

/**
 * Check whether every member of a group is off on the given day.
 */
function checkGroupFullyOff(group, day) {
  const members = getGroupMemberNames(group);
  if (members.length === 0) return false;
  for (const name of members) {
    const status = getPersonStatusOnDay(name, day);
    if (status !== 'off') return false;
  }
  return true;
}

/**
 * Get a person's status for the given day from G.schedule.
 * Returns: 'on' | 'off' | 'substitute' | 'pending'
 */
function getPersonStatusOnDay(name, day) {
  const dayStr = String(day);
  const monthData = G.schedule || {};
  for (const pid of Object.keys(monthData[dayStr] || {})) {
    const cell = monthData[dayStr][pid];
    if (cell && cell.person === name) {
      return cell.status || 'on';
    }
  }

  const pos = G.positions.find(p => (p.default_person || '').trim() === name);
  if (pos) {
    const cell = monthData[dayStr] ? monthData[dayStr][pos.id] : null;
    if (!cell || cell.status === 'on') return 'on';
  }
  return 'off';
}

/**
 * Find positions whose default person is the group name.
 */
function findPositionsByGroup(group) {
  if (!group) return [];
  return G.positions.filter(p => (p.default_person || '').trim() === group.name);
}

/**
 * Trigger auto substitute for every position in a fully-off group.
 */
async function triggerAutoSubstituteForGroup(group, day) {
  const positions = findPositionsByGroup(group);
  if (positions.length === 0) return;

  toast(`小组【${group.name}】全休，正在自动安排替班...`, 2000);

  for (const pos of positions) {
    try {
      const res = await api('/api/auto-substitute', 'POST', {
        year: G.year,
        month: G.month,
        day: day,
        pos_id: pos.id
      });

      if (res.success && res.person) {
        await saveCellState(pos.id, day, 'substitute', res.person);
        toast(`【${pos.name}】已安排替班: ${res.person}`);
      }
    } catch (e) {
      console.error('自动替班失败:', pos.name, e);
    }
  }
}
"""


def main() -> None:
    content = INDEX_HTML.read_text(encoding="utf-8")
    if "function getPersonGroup(name)" in content:
        print("Helper functions already present; nothing to do.")
        return

    marker = "function onCellClick(e){"
    insert_pos = content.find(marker)
    if insert_pos == -1:
        print("Could not find onCellClick insertion point")
        sys.exit(1)

    new_content = content[:insert_pos] + HELPER_FUNCTIONS + "\n\n" + content[insert_pos:]
    INDEX_HTML.write_text(new_content, encoding="utf-8")
    print("Added group auto-substitute helper functions")


if __name__ == "__main__":
    main()
