from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent
INDEX_HTML = BASE_DIR / "static" / "index.html"

INJECT_CODE = """
  // 小组全休自动替班检查
  if (status === 'off' && person) {
    const group = getPersonGroup(person);
    if (group && checkGroupFullyOff(group, day)) {
      await triggerAutoSubstituteForGroup(group, day);
    }
  }
"""


def main() -> None:
    content = INDEX_HTML.read_text(encoding="utf-8")
    if "await triggerAutoSubstituteForGroup(group, day);" in content:
        print("Auto-substitute injection already present; nothing to do.")
        return

    marker = "  // 更新统计\n  const activeTab"
    insert_pos = content.find(marker)
    if insert_pos == -1:
        print("Could not find injection point")
        sys.exit(1)

    new_content = content[:insert_pos] + INJECT_CODE + "\n" + content[insert_pos:]
    INDEX_HTML.write_text(new_content, encoding="utf-8")
    print("Injected group auto-substitute logic")


if __name__ == "__main__":
    main()
