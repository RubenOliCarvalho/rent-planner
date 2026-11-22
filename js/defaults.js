// Starting values for a new plan. Everything here is a placeholder the person changes.
import { RENT_ID, MOVE_SAVING_ID } from "./planner.js";

export const GROUPS = [
  ["housing", "Housing"], ["transport", "Transport"], ["food", "Food and household"],
  ["health", "Health and insurance"], ["children", "Children"], ["debt", "Debt repayments"],
  ["savings", "Savings"], ["personal", "Personal and lifestyle"], ["other", "Other"],
];

const L = (group, name, id) => ({ id: id || `${group}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, group, name, now: 0, after: 0 });

export function defaultLines() {
  return [
    L("housing", "Rent or bond", RENT_ID), L("housing", "Water and electricity"), L("housing", "Internet / fibre"),
    L("housing", "Home contents insurance"), L("housing", "Security / armed response"),
    L("transport", "Car repayment"), L("transport", "Car insurance"), L("transport", "Fuel"),
    L("transport", "Car service, tyres and licence"), L("transport", "Taxi, bus, train or Uber"),
    L("food", "Groceries"), L("food", "Toiletries and cleaning"), L("food", "Domestic worker / garden service"),
    L("health", "Medical aid"), L("health", "Gap cover"), L("health", "Life and funeral cover"), L("health", "Doctor and medicine"),
    L("children", "School fees"), L("children", "Aftercare and activities"), L("children", "Uniforms and stationery"), L("children", "Child maintenance paid"),
    L("debt", "Credit card"), L("debt", "Personal loan"), L("debt", "Store accounts"), L("debt", "Student loan"),
    L("savings", "Saving for the move", MOVE_SAVING_ID), L("savings", "Emergency savings"),
    L("savings", "Retirement annuity"), L("savings", "Tax-free savings / investments"),
    L("personal", "Cellphone"), L("personal", "Streaming and subscriptions"), L("personal", "Eating out and entertainment"),
    L("personal", "Clothing"), L("personal", "Gym and sport"), L("personal", "Pets"),
    L("other", "Gifts and donations"), L("other", "Irregular expenses (birthdays, repairs)"),
  ];
}

export function defaultPlan() {
  return {
    v: 1,
    pay: { net: 0, other: 0, gross: 0, retirement: 0, medicalMembers: 0, age: 30 },
    lines: defaultLines(),
    rules: { budgetOn: true, cushion: 500, shareOn: true, sharePct: 0.3, landlordOn: true, landlordMultiple: 3,
             landlordBasis: "gross", stretchPct: 0.1 },
    move: {
      rent: 0, depositMonths: 2, overlapMonths: 0, noticeMonths: 1, contingencyPct: 0.1,
      savings: 0, floor: 0, countLeftover: false,
      items: [
        { name: "Moving truck or van", amount: 0 }, { name: "Lease and application fees", amount: 0 },
        { name: "Electricity / water deposit", amount: 0 }, { name: "Fridge", amount: 0 },
        { name: "Washing machine", amount: 0 }, { name: "Beds and furniture", amount: 0 },
        { name: "Curtains, rails and small items", amount: 0 },
      ],
    },
    search: {
      areas: [], customAreas: [], types: ["apartment", "townhouse", "house"], bedsMin: 2, maxRent: null,
      parkingMin: 0, pets: false, unfurnished: false, sites: ["property24", "privateproperty"],
    },
  };
}

// Areas with each site's own search address (Property24 suburb ids and Private Property paths
// read from the sites' index pages, Nov 2026). Others can be added from a results link.
const P24 = "https://www.property24.com/to-rent/";
const PP = "https://www.privateproperty.co.za/to-rent/western-cape/cape-town/";
const A = (name, group, p24slug, p24id, ppPath) => ({
  name, group,
  property24: p24id ? `${P24}${p24slug}/cape-town/western-cape/${p24id}?sp=so%3dPriceLow` : null,
  privateproperty: ppPath ? PP + ppPath : null,
});
export const AREAS = [
  A("Rondebosch", "Cape Town: Southern Suburbs", "rondebosch", 8682, "southern-suburbs/rondebosch/435"),
  A("Rondebosch Village", "Cape Town: Southern Suburbs", "rondebosch-village", 8660, null),
  A("Rondebosch East", "Cape Town: Southern Suburbs", "rondebosch-east", 8806, "southern-suburbs/rondebosch-east/838"),
  A("Rosebank", "Cape Town: Southern Suburbs", "rosebank", 8683, "southern-suburbs/rosebank/1910"),
  A("Mowbray", "Cape Town: Southern Suburbs", "mowbray", 8677, "southern-suburbs/mowbray/1506"),
  A("Newlands", "Cape Town: Southern Suburbs", "newlands", 8679, "southern-suburbs/newlands/763"),
  A("Claremont", "Cape Town: Southern Suburbs", "claremont", 11741, "southern-suburbs/claremont/433"),
  A("Claremont Upper", "Cape Town: Southern Suburbs", "claremont-upper", 14225, "southern-suburbs/claremont/claremont-upper/5611"),
  A("Harfield Village", "Cape Town: Southern Suburbs", null, null, "southern-suburbs/claremont/harfield-village/9536"),
  A("Pinelands", "Cape Town: Southern Suburbs", "pinelands", 8017, "southern-suburbs/pinelands/800"),
  A("Observatory", "Cape Town: Southern Suburbs", "observatory", 10157, "southern-suburbs/observatory/1098"),
  A("Kenilworth", "Cape Town: Southern Suburbs", "kenilworth", 8669, "southern-suburbs/kenilworth/801"),
  A("Wynberg", "Cape Town: Southern Suburbs", "wynberg", 10109, "southern-suburbs/wynberg/952"),
  A("Plumstead", "Cape Town: Southern Suburbs", "plumstead", 10094, "southern-suburbs/plumstead/434"),
  A("Diep River", "Cape Town: Southern Suburbs", "diep-river", 10195, "southern-suburbs/diep-river/1742"),
  A("Bergvliet", "Cape Town: Southern Suburbs", "bergvliet", 10189, "southern-suburbs/bergvliet/803"),
  A("Tokai", "Cape Town: Southern Suburbs", "tokai", 9044, "southern-suburbs/tokai/802"),
  A("Constantia", "Cape Town: Southern Suburbs", "constantia", 11742, "southern-suburbs/constantia/432"),
];

export const SITES = {
  property24: { name: "Property24", home: "https://www.property24.com/to-rent", host: /(^|\.)property24\.com$/ },
  privateproperty: { name: "Private Property", home: "https://www.privateproperty.co.za/to-rent", host: /(^|\.)privateproperty\.co\.za$/ },
};
