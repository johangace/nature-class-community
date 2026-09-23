"""Reproduce #1094 from the checked-in upstream response; no live network."""
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/evidence/adaptive-lessons/london-2025-26-weather.json'
TERMS = [('2025-09-03', '2025-12-19'), ('2026-01-06', '2026-03-27'), ('2026-04-14', '2026-07-17')]
BREAKS = [('2025-10-27', '2025-10-31'), ('2026-02-16', '2026-02-20'), ('2026-05-25', '2026-05-29')]


def teaching_day(day):
    return (dt.date.fromisoformat(day).weekday() < 5
            and any(a <= day <= b for a, b in TERMS)
            and not any(a <= day <= b for a, b in BREAKS)
            and day != '2026-05-04')


def analyse(data):
    if data['timezone'] != 'Europe/London':
        raise ValueError('Expected local London dates')
    if data['daily_units']['precipitation_sum'] != 'mm' or data['hourly_units']['precipitation'] != 'mm':
        raise ValueError('Expected millimetres')
    days, totals = data['daily']['time'], data['daily']['precipitation_sum']
    times, hourly = data['hourly']['time'], data['hourly']['precipitation']
    if len(days) != len(totals) or len(times) != len(hourly):
        raise ValueError('Mismatched response arrays')
    if len(set(days)) != len(days) or len(set(times)) != len(times):
        raise ValueError('Duplicate source timestamps')
    daily = dict(zip(days, totals))
    hours = dict(zip(times, hourly))
    calendar = []
    cursor = dt.date.fromisoformat(TERMS[0][0])
    end = dt.date.fromisoformat(TERMS[-1][1])
    while cursor <= end:
        day = cursor.isoformat()
        if teaching_day(day):
            calendar.append(day)
        cursor += dt.timedelta(days=1)
    rows = []
    for day in calendar:
        # Open-Meteo timestamps mark the END of the preceding hour.
        # 10..15 therefore covers 09:00..15:00, not 08:00..14:00.
        values = [hours.get(f'{day}T{hour:02d}:00') for hour in range(10, 16)]
        rows.append({'date': day, 'day_mm': daily.get(day),
                     'school_window_mm': round(sum(values), 3) if all(v is not None for v in values) else None})
    def counts(selected, key):
        known = [r[key] for r in selected if r[key] is not None]
        positive = sum(v > 0 for v in known)
        return {'calendar_days': len(selected), 'known_days': len(known),
                'missing_days': len(selected) - len(known), 'positive_precipitation_days': positive,
                'percent_of_known': round(100 * positive / len(known), 2) if known else None}
    return {'annual': {k: counts(rows, k) for k in ['day_mm', 'school_window_mm']},
            'autumn': {k: counts([r for r in rows if r['date'] < '2026'], k) for k in ['day_mm', 'school_window_mm']},
            'rows': rows}


if __name__ == '__main__':
    raw = SOURCE.read_bytes()
    data = json.loads(raw)
    print(json.dumps({'source_sha256': hashlib.sha256(raw).hexdigest(), **analyse(data)}, indent=2))
