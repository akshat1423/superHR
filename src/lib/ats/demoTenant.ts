import { tabularFromCsv } from "../onboarding/datasets";
import { SAMPLE_CSV } from "../sample";

/**
 * The demo ATS tenant: the 14 people already onboarding plus five candidates who accepted offers since, so the first
 * sync has something new to bring in and a second one correctly finds nothing.
 */
const NEW_HIRES = `full_name,email,phone,role,department,emp_type,level,grade,location,start_date,manager,dob,address,pan,aadhaar,bank_account,photo_url,emergency_contact,education,prev_employer,school
Anaya Joshi,anaya.joshi@gmail.com,+91 98100 11015,Product Manager,Product,Full-time,Senior,L5,Mumbai,2026-11-09,Isha Menon,1993-03-18,"21 Linking Road, Mumbai",ABCPJ4455L,XXXX-6620,HDFC ••3310,,Mihir Joshi,MBA,Swiggy,IIM Bangalore
Liam Foster,liam.foster@gmail.com,+1 512 555 0148,Platform Engineer,Engineering,Full-time,Mid,L4,Austin,2026-11-16,Arjun Rao,1995-11-02,"88 Congress Ave, Austin",,,,,Dana Foster,B.S. Computer Science,Stripe,UT Austin
Rohit Sinha,rohit.sinha@gmail.com,+91 98100 11016,Financial Analyst,Finance,Full-time,Associate,L3,Bengaluru,2026-11-10,Neha Kapoor,1999-07-25,,ABCPS8890M,,,,,B.Com,,Christ University
Mira Kapoor,mira.kapoor@gmail.com,+91 98100 11017,Account Executive,Business,Full-time,Mid,L3,Delhi,2026-11-12,Rahul Jain,1996-01-09,"14 Vasant Vihar, Delhi",ABCPK2234N,XXXX-1305,ICICI ••5521,photo-mira.jpg,Anil Kapoor,BBA,Freshworks,Delhi University
Owen Blake,owen.blake@gmail.com,+91 98100 11018,SDE Intern,Engineering,Intern,Intern,INT,Pune,2026-11-23,Dev Patel,2004-09-14,,,,,,,,,COEP Pune
`;

export const demoTenantRows = (): Record<string, string>[] => [...tabularFromCsv(SAMPLE_CSV).rows, ...tabularFromCsv(NEW_HIRES).rows];
