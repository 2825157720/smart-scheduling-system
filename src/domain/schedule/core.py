"""Compatibility export while the legacy Flask runtime remains active."""

from schedule_core import (
    FAIRNESS_LOAD_TOLERANCE,
    FAIRNESS_ROTATION_LOAD_TOLERANCE,
    build_day_base,
    build_fairness_context,
    can_cover_member,
    find_global_name_collisions,
    group_active_members,
    group_is_fully_off,
    group_member_names,
    person_day_workload,
    plan_day_schedule,
    rank_fair_candidates,
)

__all__ = [
    "FAIRNESS_LOAD_TOLERANCE", "FAIRNESS_ROTATION_LOAD_TOLERANCE",
    "build_day_base", "build_fairness_context",
    "can_cover_member", "find_global_name_collisions",
    "group_active_members", "group_is_fully_off", "group_member_names",
    "person_day_workload", "plan_day_schedule", "rank_fair_candidates",
]
