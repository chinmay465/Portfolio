const DEVANAGARI_DIGITS = '०१२३४५६७८९'

export function toDevanagariDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)])
}

const MONTHS_MR = ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर']
const WEEKDAYS_MR = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']

/** "शुक्रवार, २० नोव्हेंबर" — the dateline Ank prints on its masthead. */
export function marathiDate(d: Date): string {
  return `${WEEKDAYS_MR[d.getDay()]}, ${toDevanagariDigits(d.getDate())} ${MONTHS_MR[d.getMonth()]}`
}
