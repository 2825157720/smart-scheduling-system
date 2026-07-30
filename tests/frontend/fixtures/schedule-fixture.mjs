export const FIXED_NOW = "2026-08-15T09:00:00+08:00";

const staffNames = [
  "安然", "白露", "陈曦", "冬青", "方晴", "谷雨", "何川",
  "江月", "柯宁", "林夏", "木棉", "宁秋", "乔松", "沈禾"
];

const positionNames = [
  "收货登记", "到货核对", "质检录入", "库存上架", "次品复核", "京东出库", "门店补货",
  "调拨处理", "单据归档", "异常跟进", "数据复盘", "晚班交接", "现场巡检", "机动岗位"
];

export function buildFrontendFixture() {
  const groups = [
    { id: "group-a", name: "散排A组", member_names: staffNames.slice(0, 3) },
    { id: "group-b", name: "散排B组", member_names: staffNames.slice(3, 6) }
  ];

  const staff = staffNames.map((name, index) => ({
    id: `staff-${String(index + 1).padStart(2, "0")}`,
    name,
    group_id: index < 3 ? "group-a" : index < 6 ? "group-b" : "",
    group_name: index < 3 ? "散排A组" : index < 6 ? "散排B组" : "",
    can_cpin: index % 4 === 0,
    can_jd: index % 3 === 0,
    saturday_only: index === 12,
    weekend_only: index === 11,
    no_substitute: index === 13
  }));

  const positions = positionNames.map((name, index) => ({
    id: `position-${String(index + 1).padStart(2, "0")}`,
    name,
    workload: 4 + (index % 6) * 2,
    category: index === 4 ? "次品" : index === 5 ? "京东" : "",
    split_allowed: index % 3 === 1,
    default_person: index === 0 ? "散排A组" : index === 13 ? "" : staffNames[index]
  }));

  const schedule = {};
  for (let day = 1; day <= 31; day += 1) {
    const dayData = { _off_persons: [], _scatter_groups: day % 7 >= 5 };
    for (const position of positions) {
      dayData[position.id] = position.default_person
        ? { status: "on", person: position.default_person }
        : { status: "pending", person: "" };
    }

    dayData[positions[1].id] = {
      status: day % 5 === 0 ? "off" : "on",
      person: positions[1].default_person
    };
    dayData[positions[2].id] = {
      status: day % 4 === 0 ? "substitute" : "on",
      person: day % 4 === 0 ? staffNames[8] : positions[2].default_person
    };
    dayData[positions[3].id] = day % 6 === 0
      ? { status: "pending", person: "" }
      : { status: "on", person: positions[3].default_person };

    if (day % 7 === 0 || day === 3) {
      dayData[positions[4].id] = {
        status: "split",
        person: staffNames[4],
        slots: {
          am: { status: "on", person: staffNames[4], workload: 6 },
          pm: { status: "substitute", person: staffNames[9], workload: 6 }
        }
      };
    }
    if (day === 8) {
      dayData[positions[7].id] = {
        status: "split",
        person: "",
        slots: {
          am: { status: "off", person: staffNames[7], workload: 5 },
          pm: { status: "pending", person: "", workload: 5 }
        }
      };
    }

    if (day % 5 === 0) dayData._off_persons = [staffNames[1]];
    schedule[String(day)] = dayData;
  }

  return {
    positions,
    staff,
    groups,
    schedule,
    memo: {
      content: "本周重点：周五复核调拨单；晚班完成交接后在群内确认。",
      updated_at: "2026-08-15 08:30"
    }
  };
}
