/**
 * Comprehensive country-to-locale mapping with date and address formats
 * Maps country codes to their specific locale settings
 */

export interface CountryLocaleInfo {
  countryCode: string;
  localeCode: string;
  dateFormat: 'DMY' | 'MDY' | 'YMD' | 'YDM';  // Day-Month-Year order
  dateSeparator: '/' | '-' | '.';
  timeFormat: '12h' | '24h';
  firstDayOfWeek: 0 | 1 | 5 | 6; // 0=Sunday, 1=Monday, 5=Friday, 6=Saturday
  decimalSeparator: '.' | ',';
  thousandsSeparator: ',' | '.' | ' ' | "'";
  currencyPosition: 'before' | 'after';
  addressFormat: string;
  postalCodePattern?: RegExp;
  postalCodeLabel: string;
  stateProvinceLabel?: string;
  requiresState?: boolean;
  phonePattern?: RegExp;
}

// Comprehensive mapping of all countries to their locale settings
export const COUNTRY_LOCALE_MAP: Record<string, CountryLocaleInfo> = {
  // Americas - North
  'US': {
    countryCode: 'US',
    localeCode: 'en-US',
    dateFormat: 'MDY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{city}, {stateProvince} {postalCode}',
    postalCodePattern: /^\d{5}(-\d{4})?$/,
    postalCodeLabel: 'ZIP Code',
    stateProvinceLabel: 'State',
    requiresState: true
  },
  'CA': {
    countryCode: 'CA',
    localeCode: 'en-CA',
    dateFormat: 'DMY',
    dateSeparator: '-',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{city} {stateProvince} {postalCode}',
    postalCodePattern: /^[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]$/i,
    postalCodeLabel: 'Postal Code',
    stateProvinceLabel: 'Province',
    requiresState: true
  },
  'MX': {
    countryCode: 'MX',
    localeCode: 'es-MX',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{postalCode} {city}, {stateProvince}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Código Postal',
    stateProvinceLabel: 'Estado'
  },

  // Americas - Central & Caribbean
  'GT': {
    countryCode: 'GT',
    localeCode: 'es-GT',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Código Postal'
  },
  'CR': {
    countryCode: 'CR',
    localeCode: 'es-CR',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}, {stateProvince} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Código Postal'
  },
  'PA': {
    countryCode: 'PA',
    localeCode: 'es-PA',
    dateFormat: 'MDY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}',
    postalCodeLabel: 'Código Postal'
  },

  // Americas - South
  'BR': {
    countryCode: 'BR',
    localeCode: 'pt-BR',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{city} - {stateProvince}\n{postalCode}',
    postalCodePattern: /^\d{5}-?\d{3}$/,
    postalCodeLabel: 'CEP',
    stateProvinceLabel: 'Estado'
  },
  'AR': {
    countryCode: 'AR',
    localeCode: 'es-AR',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}\n{stateProvince}',
    postalCodePattern: /^[A-Z]\d{4}[A-Z]{3}$/,
    postalCodeLabel: 'Código Postal',
    stateProvinceLabel: 'Provincia'
  },
  'CL': {
    countryCode: 'CL',
    localeCode: 'es-CL',
    dateFormat: 'DMY',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{7}$/,
    postalCodeLabel: 'Código Postal'
  },
  'CO': {
    countryCode: 'CO',
    localeCode: 'es-CO',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}, {stateProvince}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Código Postal'
  },
  'PE': {
    countryCode: 'PE',
    localeCode: 'es-PE',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Código Postal'
  },

  // Europe - Western
  'GB': {
    countryCode: 'GB',
    localeCode: 'en-GB',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{city}\n{stateProvince}\n{postalCode}',
    postalCodePattern: /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i,
    postalCodeLabel: 'Postcode',
    stateProvinceLabel: 'County'
  },
  'FR': {
    countryCode: 'FR',
    localeCode: 'fr-FR',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{postalCode} {city}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Code Postal'
  },
  'DE': {
    countryCode: 'DE',
    localeCode: 'de-DE',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'PLZ'
  },
  'ES': {
    countryCode: 'ES',
    localeCode: 'es-ES',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}\n{stateProvince}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Código Postal',
    stateProvinceLabel: 'Provincia'
  },
  'IT': {
    countryCode: 'IT',
    localeCode: 'it-IT',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city} {stateProvince}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'CAP',
    stateProvinceLabel: 'Provincia'
  },
  'NL': {
    countryCode: 'NL',
    localeCode: 'nl-NL',
    dateFormat: 'DMY',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4} ?[A-Z]{2}$/,
    postalCodeLabel: 'Postcode'
  },
  'BE': {
    countryCode: 'BE',
    localeCode: 'nl-BE',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postcode'
  },
  'CH': {
    countryCode: 'CH',
    localeCode: 'de-CH',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: "'",
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'PLZ'
  },
  'AT': {
    countryCode: 'AT',
    localeCode: 'de-AT',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'PLZ'
  },
  'PT': {
    countryCode: 'PT',
    localeCode: 'pt-PT',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}-\d{3}$/,
    postalCodeLabel: 'Código Postal'
  },
  'IE': {
    countryCode: 'IE',
    localeCode: 'en-IE',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{streetAddress2}\n{city}\n{stateProvince}\n{postalCode}',
    postalCodePattern: /^[A-Z]\d{2} ?[A-Z0-9]{4}$/,
    postalCodeLabel: 'Eircode',
    stateProvinceLabel: 'County'
  },

  // Europe - Northern
  'SE': {
    countryCode: 'SE',
    localeCode: 'sv-SE',
    dateFormat: 'YMD',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{3} ?\d{2}$/,
    postalCodeLabel: 'Postnummer'
  },
  'NO': {
    countryCode: 'NO',
    localeCode: 'nb-NO',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postnummer'
  },
  'DK': {
    countryCode: 'DK',
    localeCode: 'da-DK',
    dateFormat: 'DMY',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postnummer'
  },
  'FI': {
    countryCode: 'FI',
    localeCode: 'fi-FI',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Postinumero'
  },
  'IS': {
    countryCode: 'IS',
    localeCode: 'is-IS',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{3}$/,
    postalCodeLabel: 'Póstnúmer'
  },

  // Europe - Eastern
  'PL': {
    countryCode: 'PL',
    localeCode: 'pl-PL',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{2}-\d{3}$/,
    postalCodeLabel: 'Kod pocztowy'
  },
  'CZ': {
    countryCode: 'CZ',
    localeCode: 'cs-CZ',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{3} ?\d{2}$/,
    postalCodeLabel: 'PSČ'
  },
  'SK': {
    countryCode: 'SK',
    localeCode: 'sk-SK',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{3} ?\d{2}$/,
    postalCodeLabel: 'PSČ'
  },
  'HU': {
    countryCode: 'HU',
    localeCode: 'hu-HU',
    dateFormat: 'YMD',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{city}\n{streetAddress}\n{postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Irányítószám'
  },
  'RO': {
    countryCode: 'RO',
    localeCode: 'ro-RO',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Cod poștal'
  },
  'BG': {
    countryCode: 'BG',
    localeCode: 'bg-BG',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Пощенски код'
  },
  'UA': {
    countryCode: 'UA',
    localeCode: 'uk-UA',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{city}\n{postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Поштовий індекс'
  },
  'RU': {
    countryCode: 'RU',
    localeCode: 'ru-RU',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    addressFormat: '{postalCode}, {city}\n{streetAddress}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Почтовый индекс'
  },

  // Asia - East
  'CN': {
    countryCode: 'CN',
    localeCode: 'zh-CN',
    dateFormat: 'YMD',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{postalCode}\n{stateProvince}{city}\n{streetAddress}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: '邮政编码',
    stateProvinceLabel: '省'
  },
  'JP': {
    countryCode: 'JP',
    localeCode: 'ja-JP',
    dateFormat: 'YMD',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '〒{postalCode}\n{stateProvince}{city}{streetAddress}',
    postalCodePattern: /^\d{3}-?\d{4}$/,
    postalCodeLabel: '郵便番号',
    stateProvinceLabel: '都道府県'
  },
  'KR': {
    countryCode: 'KR',
    localeCode: 'ko-KR',
    dateFormat: 'YMD',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{stateProvince} {city}\n{streetAddress}\n{postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: '우편번호',
    stateProvinceLabel: '시/도'
  },
  'TW': {
    countryCode: 'TW',
    localeCode: 'zh-TW',
    dateFormat: 'YMD',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{postalCode}\n{city}{streetAddress}',
    postalCodePattern: /^\d{3,5}$/,
    postalCodeLabel: '郵遞區號'
  },

  // Asia - Southeast
  'TH': {
    countryCode: 'TH',
    localeCode: 'th-TH',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'รหัสไปรษณีย์'
  },
  'VN': {
    countryCode: 'VN',
    localeCode: 'vi-VN',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{city}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Mã bưu chính'
  },
  'ID': {
    countryCode: 'ID',
    localeCode: 'id-ID',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Kode Pos'
  },
  'MY': {
    countryCode: 'MY',
    localeCode: 'ms-MY',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{postalCode} {city}\n{stateProvince}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Poskod',
    stateProvinceLabel: 'Negeri'
  },
  'SG': {
    countryCode: 'SG',
    localeCode: 'en-SG',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\nSingapore {postalCode}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Postal Code'
  },
  'PH': {
    countryCode: 'PH',
    localeCode: 'en-PH',
    dateFormat: 'MDY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'ZIP Code'
  },

  // Asia - South
  'IN': {
    countryCode: 'IN',
    localeCode: 'en-IN',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} - {postalCode}\n{stateProvince}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'PIN Code',
    stateProvinceLabel: 'State'
  },
  'PK': {
    countryCode: 'PK',
    localeCode: 'ur-PK',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}-{postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Postal Code'
  },
  'BD': {
    countryCode: 'BD',
    localeCode: 'bn-BD',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postal Code'
  },
  'LK': {
    countryCode: 'LK',
    localeCode: 'si-LK',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Postal Code'
  },

  // Middle East
  'SA': {
    countryCode: 'SA',
    localeCode: 'ar-SA',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 6,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'الرمز البريدي'
  },
  'AE': {
    countryCode: 'AE',
    localeCode: 'ar-AE',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 6,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{city}',
    postalCodeLabel: 'P.O. Box'
  },
  'IL': {
    countryCode: 'IL',
    localeCode: 'he-IL',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{7}$/,
    postalCodeLabel: 'מיקוד'
  },
  'TR': {
    countryCode: 'TR',
    localeCode: 'tr-TR',
    dateFormat: 'DMY',
    dateSeparator: '.',
    timeFormat: '24h',
    firstDayOfWeek: 1,
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{postalCode} {city}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Posta Kodu'
  },

  // Africa
  'ZA': {
    countryCode: 'ZA',
    localeCode: 'en-ZA',
    dateFormat: 'YMD',
    dateSeparator: '-',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}\n{postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postal Code'
  },
  'EG': {
    countryCode: 'EG',
    localeCode: 'ar-EG',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 6,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'after',
    addressFormat: '{streetAddress}\n{city}\n{postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'الرمز البريدي'
  },
  'NG': {
    countryCode: 'NG',
    localeCode: 'en-NG',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{6}$/,
    postalCodeLabel: 'Postal Code'
  },
  'KE': {
    countryCode: 'KE',
    localeCode: 'sw-KE',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 0,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city}\n{postalCode}',
    postalCodePattern: /^\d{5}$/,
    postalCodeLabel: 'Postal Code'
  },

  // Oceania
  'AU': {
    countryCode: 'AU',
    localeCode: 'en-AU',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {stateProvince} {postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postcode',
    stateProvinceLabel: 'State/Territory'
  },
  'NZ': {
    countryCode: 'NZ',
    localeCode: 'en-NZ',
    dateFormat: 'DMY',
    dateSeparator: '/',
    timeFormat: '12h',
    firstDayOfWeek: 1,
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    addressFormat: '{streetAddress}\n{city} {postalCode}',
    postalCodePattern: /^\d{4}$/,
    postalCodeLabel: 'Postcode'
  }
};

// Helper function to get locale info by country code
export function getCountryLocaleInfo(countryCode: string): CountryLocaleInfo {
  return COUNTRY_LOCALE_MAP[countryCode] || COUNTRY_LOCALE_MAP['US'];
}

// Helper function to format date according to country's locale
export function formatDateByCountry(date: Date, countryCode: string): string {
  const localeInfo = getCountryLocaleInfo(countryCode);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  
  switch (localeInfo.dateFormat) {
    case 'MDY':
      return `${month}${localeInfo.dateSeparator}${day}${localeInfo.dateSeparator}${year}`;
    case 'YMD':
      return `${year}${localeInfo.dateSeparator}${month}${localeInfo.dateSeparator}${day}`;
    case 'YDM':
      return `${year}${localeInfo.dateSeparator}${day}${localeInfo.dateSeparator}${month}`;
    case 'DMY':
    default:
      return `${day}${localeInfo.dateSeparator}${month}${localeInfo.dateSeparator}${year}`;
  }
}

// Get date format display string (e.g., "DD/MM/YYYY")
export function getDateFormatDisplay(countryCode: string): string {
  const localeInfo = getCountryLocaleInfo(countryCode);
  const sep = localeInfo.dateSeparator;
  
  switch (localeInfo.dateFormat) {
    case 'MDY':
      return `MM${sep}DD${sep}YYYY`;
    case 'YMD':
      return `YYYY${sep}MM${sep}DD`;
    case 'YDM':
      return `YYYY${sep}DD${sep}MM`;
    case 'DMY':
    default:
      return `DD${sep}MM${sep}YYYY`;
  }
} 