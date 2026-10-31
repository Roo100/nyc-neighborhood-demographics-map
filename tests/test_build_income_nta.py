import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_income_nta import BRACKET_COLS, FIELDS, aggregate, grouped_median, as_count


def tract(geoid, households=10, poverty_total=9, poverty_below=2):
    row = {"tract_geoid": geoid}
    row.update({field: "0" for field in FIELDS})
    row["B19001_001E"] = str(households)
    row[BRACKET_COLS[0]] = str(households)
    row["B17001_001E"] = str(poverty_total)
    row["B17001_002E"] = str(poverty_below)
    return row


class IncomePipelineTests(unittest.TestCase):
    def test_missing_not_zero(self):
        for value in ["", None, "-666666666", "N", "-1"]:
            self.assertIsNone(as_count(value))
        self.assertEqual(as_count("0"), 0)

    def test_grouped_income_median_is_not_mean_of_tract_medians(self):
        values = [0] * 16
        values[0] = 10
        self.assertEqual(grouped_median(values, 10), 5000)

    def test_open_ended_top_bracket_returns_null(self):
        values = [0] * 16
        values[-1] = 10
        self.assertIsNone(grouped_median(values, 10))

    def test_aggregate_uses_official_tract_mapping(self):
        one = tract("36005008300", 10, 9, 2)
        two = tract("36005008500", 10, 9, 4)
        result, excluded = aggregate(
            [one, two],
            {"36005008300": "BX0202", "36005008500": "BX0202"},
            {"BX0202"},
        )
        self.assertEqual(excluded, [])
        self.assertEqual(result[0]["households"], 20)
        self.assertEqual(result[0]["median_household_income_grouped_approx_usd"], 5000)
        self.assertEqual(result[0]["poverty_rate_pct"], 33.33)
        self.assertEqual(result[0]["status"], "derived_from_tract_acs")

    def test_incomplete_nta_not_partially_aggregated(self):
        result, excluded = aggregate(
            [tract("36005008300")],
            {"36005008300": "BX0202", "36005008500": "BX0202"},
            {"BX0202"},
        )
        self.assertEqual(result[0]["status"], "not_available")
        self.assertIsNone(result[0].get("households"))
        self.assertIn("missing ACS tract", str(result[0]["reasons"]))

    def test_unmapped_acs_tract_is_reported(self):
        result, excluded = aggregate([tract("36005008300"), tract("36005008500")],
                                     {"36005008300": "BX0202"}, {"BX0202"})
        self.assertEqual(excluded, ["36005008500"])


if __name__ == "__main__":
    unittest.main()
