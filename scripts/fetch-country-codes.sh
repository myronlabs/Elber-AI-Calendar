#!/bin/bash

# Script to fetch ISO country codes and formats using REST Countries API
# This script outputs data in a format compatible with the ADDRESS_FORMATS in localeUtils.ts

echo "Fetching country data from REST Countries API..."

# Create directory for temporary files
mkdir -p ./.temp

# Fetch all countries with name, alpha2Code, alpha3Code, and region information
curl -s "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,region,subregion,idd" > ./.temp/countries.json

echo "Processing data into a suitable format..."

# Use jq to transform the data into a JavaScript object
cat ./.temp/countries.json | jq -r '
  reduce .[] as $country (
    {};
    . + {
      ($country.cca2): {
        "name": $country.name.common,
        "code": $country.cca2,
        "code3": $country.cca3,
        "region": $country.region,
        "subregion": $country.subregion,
        "callingCode": (if $country.idd.root then ($country.idd.root + (if $country.idd.suffixes and ($country.idd.suffixes | length) > 0 then $country.idd.suffixes[0] else "" end)) else null end)
      }
    }
  )
' > ./.temp/formatted_countries.json

# Create JavaScript file with exported constant
echo "// Auto-generated list of ISO country codes and formats
// Generated on $(date)
// Data source: REST Countries API v3.1

export const COUNTRY_CODES = $(cat ./.temp/formatted_countries.json);" > src/frontend/utils/countryData.ts

echo "Done! Country data has been saved to src/frontend/utils/countryData.ts"
echo "Total countries: $(jq 'length' ./.temp/formatted_countries.json)"

# Clean up
rm -rf ./.temp

echo "You can now import COUNTRY_CODES in your application." 