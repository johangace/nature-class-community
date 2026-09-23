import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('wet_days', Path(__file__).with_name('london-wet-days.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WetDaysTest(unittest.TestCase):
    def test_calendar_excludes_inset_weekends_holidays(self):
        for day in ['2025-09-01', '2025-09-02', '2025-09-06', '2025-10-28', '2026-01-05', '2026-04-13', '2026-05-04', '2026-07-20']:
            self.assertFalse(module.teaching_day(day), day)
        self.assertTrue(module.teaching_day('2025-09-03'))

    def fixture(self):
        return {'timezone': 'Europe/London', 'daily_units': {'precipitation_sum': 'mm'},
                'hourly_units': {'precipitation': 'mm'},
                'daily': {'time': ['2025-09-03'], 'precipitation_sum': [2]},
                'hourly': {'time': [f'2025-09-03T{h:02d}:00' for h in range(9, 16)],
                           'precipitation': [4, 0, 0, 0, 0, 0, 2]}}

    def test_preceding_hour_window_and_missing_days(self):
        result = module.analyse(self.fixture())
        self.assertEqual(result['rows'][0]['school_window_mm'], 2)
        self.assertEqual(result['annual']['day_mm']['known_days'], 1)
        self.assertEqual(result['annual']['day_mm']['missing_days'], 189)

    def test_missing_hour_is_not_a_dry_hour(self):
        data = self.fixture()
        data['hourly']['precipitation'][-1] = None
        self.assertIsNone(module.analyse(data)['rows'][0]['school_window_mm'])


if __name__ == '__main__':
    unittest.main()
