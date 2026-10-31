import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from build_acs_nta_2024 import summarise,conservative_percentage_moe,moe_key
from build_income_nta import BRACKET_COLS

def sample():
    fields={f"B19001_{i:03d}E":"0" for i in range(1,18)}
    fields.update({f"B19001_{i:03d}M":"2" for i in range(1,18)})
    fields["B19001_001E"]="100"; fields["B19001_012E"]="100"
    fields.update({"B17001_001E":"100","B17001_002E":"20",
        "B17001_001M":"10","B17001_002M":"5",
        "B03002_001E":"120","B03002_002E":"80",
        "B03002_003E":"30","B03002_004E":"20",
        "B03002_006E":"20","B03002_012E":"40"})
    for i in (1,2,3,4,6,12):fields[f"B03002_{i:03d}M"]="4"
    return fields

class NtaACSQuality(unittest.TestCase):
    def test_source_moe_column_naming(self):
        self.assertEqual(moe_key("B19001_001E"),"B19001_001M")

    def test_race_groups_are_exclusive_and_sum_to_population(self):
        r=summarise([sample()])
        self.assertEqual(r["race_ethnicity_counts"],{
            "White non-Hispanic":30,"Black non-Hispanic":20,
            "Asian non-Hispanic":20,"Hispanic (any race)":40,
            "Other non-Hispanic":10})
        self.assertEqual(sum(r["race_ethnicity_counts"].values()),120)
        self.assertAlmostEqual(sum(r["race_ethnicity_percent"].values()),100,places=1)
        self.assertEqual(r["poverty_rate_pct"],20)
        self.assertIsNotNone(r["poverty_rate_moe_90_pp_conservative"])

    def test_missing_or_suppressed_tract_prevents_race_rate(self):
        bad=sample()
        bad["B03002_004E"]="-666666666"
        r=summarise([sample(),bad])
        self.assertEqual(r["race_status"],"not_available")
        self.assertIsNone(r["race_ethnicity_percent"])

    def test_not_a_mean_of_tract_medians(self):
        a=sample()
        r=summarise([a])
        self.assertEqual(r["income_status"],"derived_approximation")
        self.assertGreater(r["median_household_income_grouped_approx_usd"],0)

    def test_zero_poverty_universe_or_bad_moe(self):
        bad=sample()
        bad["B17001_001E"]="0";bad["B17001_002E"]="0"
        r=summarise([bad])
        self.assertEqual(r["poverty_status"],"not_available")
        self.assertIsNone(r["poverty_rate_pct"])
        bad=sample();bad["B17001_001M"]="-555555555"
        r=summarise([bad])
        self.assertEqual(r["poverty_status"],"complete")
        self.assertIsNone(r["poverty_rate_moe_90_pp_conservative"])

if __name__=='__main__':unittest.main()
