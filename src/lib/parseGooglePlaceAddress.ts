/**
 * Places Autocomplete `getPlace().address_components` → 하위 폼 필드(휴리스틱).
 * 국가·주소체계마다 컴포넌트 구성이 달라 100% 일치하지 않을 수 있음.
 */
export function parseGooglePlaceToParts(place: google.maps.places.PlaceResult): {
  cityRegion: string;
  streetHouse: string;
  apartmentOffice: string;
  postcode: string;
} {
  const comps = place.address_components;
  if (!comps?.length) {
    return { cityRegion: '', streetHouse: '', apartmentOffice: '', postcode: '' };
  }

  const pick = (...types: string[]) => {
    for (const t of types) {
      const c = comps.find((x) => x.types.includes(t));
      if (c?.long_name) return c.long_name;
    }
    return '';
  };

  const streetNumber = pick('street_number');
  const route = pick('route');
  const subpremise = pick('subpremise');
  const premise = pick('premise');
  const floor = pick('floor');
  const locality = pick('locality', 'postal_town');
  const neighborhood = pick('neighborhood', 'sublocality', 'sublocality_level_1');
  const admin2 = pick('administrative_area_level_2');
  const admin1 = pick('administrative_area_level_1');
  const postal = pick('postal_code');

  const loc = locality || neighborhood;
  const cityRegion = [...new Set([loc, admin2, admin1].filter(Boolean))].join(', ');
  const streetHouse = [route, streetNumber].filter(Boolean).join(' ').trim();
  const apartmentOffice = [subpremise, premise, floor].filter(Boolean).join(', ');

  return {
    cityRegion: cityRegion.trim(),
    streetHouse,
    apartmentOffice: apartmentOffice.trim(),
    postcode: postal,
  };
}
