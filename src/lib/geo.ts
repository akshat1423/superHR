export type Country = "IN" | "US";

const CITY_COUNTRY: Record<string, Country> = {
  bengaluru: "IN", bangalore: "IN", hyderabad: "IN", pune: "IN", mumbai: "IN", chennai: "IN", kolkata: "IN", delhi: "IN", gurugram: "IN", noida: "IN",
  austin: "US", "san francisco": "US", "new york": "US", seattle: "US", boston: "US",
};

export const KNOWN_LOCATIONS = ["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Chennai", "Kolkata", "Delhi", "Gurugram", "Noida", "Austin", "San Francisco", "New York", "Seattle", "Boston"];

/** Country for an office city. Unknown cities default to India, where most of the sample data lives. */
export const countryOf = (location: string): Country => CITY_COUNTRY[location.trim().toLowerCase()] ?? "IN";
export const isKnownLocation = (location: string) => location.trim().toLowerCase() in CITY_COUNTRY;
export const COUNTRY_NAME: Record<Country, string> = { IN: "India", US: "United States" };
