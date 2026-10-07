-- Badminton venues across Australia. GENERATED FILE: do not edit by hand.
-- Regenerate with: python3 supabase/seeds/scripts/generate_venues.py
--
-- Source: BadmintonHub (badmintonhub.com.au) venue pages, collected from the
-- published structured data, respecting robots.txt. 142 venues.
-- Use in production is pending BadmintonHub's permission (team item 8).
--
-- Every pin was checked against the venue's suburb. BadmintonHub pins found wrong:
--   https://www.badmintonhub.com.au/venues/43: BadmintonHub latitude -36.777 is one degree south of Maribyrnong (-37.77); likely a typo
--
-- Pins looked up with OpenStreetMap Nominatim instead (credit:
-- "(c) OpenStreetMap contributors", ODbL):
--   https://www.badmintonhub.com.au/venues/43 (Maribyrnong College / Play Badminton): -37.778024, 144.889050
--
-- No pin found (the Google Maps link searches by name and address):
--   none
--
-- Listed twice by BadmintonHub; one copy kept:
--   https://www.badmintonhub.com.au/venues/257 (duplicate of https://www.badmintonhub.com.au/venues/64, Doncaster Badminton Centre)
--   https://www.badmintonhub.com.au/venues/92 (duplicate of https://www.badmintonhub.com.au/venues/234, Victory Badminton Centre)
--
-- Safe to run repeatedly: a venue is matched on (name, suburb) and updated.
-- Suburbs match on name, postcode and state, or on name and state when the
-- listing's postcode differs from ours.

insert into public.venue (name, address, suburb_id, latitude, longitude, coordinates_source, source_url)
select v.name, v.street, s.suburb_id, v.lat, v.lng, v.coordinates_source, v.source_url
from (values
  ('Canberra Badminton Centre', '27 Lithgow St, Fyshwick ACT 2609', 'Fyshwick', '2609', 'ACT', -35.328869, 149.169223, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/240'),
  ('Erindale Leisure Centre', '115 McBryde Cres, Wanniassa ACT 2903', 'Wanniassa', '2903', 'ACT', -35.403052, 149.095603, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/219'),
  ('ATC badminton centre', 'Unit A/27 Hiles St, Alexandria NSW 2015', 'Alexandria', '2015', 'NSW', -33.903511, 151.199512, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/208'),
  ('NBC Alexandria', '8/190 Bourke Rd, Alexandria NSW 2015', 'Alexandria', '2015', 'NSW', -33.917224, 151.192216, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/242'),
  ('Alpha Badminton Centre Auburn', 'Unit 6, Building 2/161 Manchester Rd, Auburn NSW 2144', 'Auburn', '2144', 'NSW', -33.845106, 151.018670, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/226'),
  ('Avalon Badminton Club', '59 Old Barrenjoey Rd, Avalon Beach NSW 2106', 'Avalon Beach', '2106', 'NSW', -33.635726, 151.329256, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/239'),
  ('BadmintonWorx - Botany', 'Unit 2/30 Sir Joseph Banks St, Botany NSW 2019', 'Botany', '2019', 'NSW', -33.949570, 151.202927, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/204'),
  ('A1 Badminton Centre', '11 Mount Erin Rd, Campbelltown NSW 2560', 'Campbelltown', '2560', 'NSW', -34.059673, 150.803931, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/199'),
  ('VBVA Albury Wodonga', '229 North Road, East Albury NSW 2640', 'East Albury', '2640', 'NSW', -36.083300, 146.916700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/192'),
  ('Sydney Badminton', 'Kenwyn St, Hurstville NSW 2220', 'Hurstville', '2220', 'NSW', -33.962277, 151.110583, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/236'),
  ('Roketto Badminton', '22 Carter St, Lidcombe NSW 2141', 'Lidcombe', '2141', 'NSW', -33.851210, 151.057487, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/221'),
  ('Revolution Sports Park', '55 The Avenue, Maryville NSW 2293', 'Maryville', '2293', 'NSW', -32.913447, 151.755996, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/201'),
  ('Echuca Moama Badminton Club', '48 Echuca Street, Moama NSW 2731', 'Moama', '2731', 'NSW', -36.100000, 144.750000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/184'),
  ('BadmintonWorx Norwest', '2/2 Inglewood Pl, Norwest NSW 2153', 'Norwest', '2153', 'NSW', -33.735858, 150.958946, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/211'),
  ('The Badminton Club Prestons.', '276 Kurrajong Rd, Parking on, Kookaburra Rd N, Prestons NSW 2170', 'Prestons', '2170', 'NSW', -33.940554, 150.858876, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/230'),
  ('NBC Seven Hills', '3/17 Stanton Rd, Seven Hills NSW 2147', 'Seven Hills', '2147', 'NSW', -33.770613, 150.953200, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/200'),
  ('PlayPoint Seven Hills', '2/6 Boden Rd, Seven Hills NSW 2147', 'Seven Hills', '2147', 'NSW', -33.773947, 150.960008, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/220'),
  ('Alpha Badminton Centre (Egerton)', '46 Egerton St, Silverwater NSW 2128', 'Silverwater', '2128', 'NSW', -33.834446, 151.045578, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/222'),
  ('Alpha Slough', 'f47/2 Slough Ave, Silverwater NSW 2128', 'Silverwater', '2128', 'NSW', -33.830845, 151.050033, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/202'),
  ('JS Sports Arena', '75 Anderson Rd, Smeaton Grange NSW 2567', 'Smeaton Grange', '2567', 'NSW', -34.034063, 150.761189, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/241'),
  ('NBC Granville', '3F/62 Ferndell St, South Granville NSW 2142', 'South Granville', '2142', 'NSW', -33.868900, 151.007046, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/243'),
  ('Sydney Olympic Park Sports Halls', 'Grand Parade, Sydney Olympic Park NSW 2127', 'Sydney Olympic Park', '2127', 'NSW', -33.844704, 151.064901, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/205'),
  ('APX Badminton Courts', 'Unit 2 & 3/35E Sefton Rd, Thornleigh NSW 2120', 'Thornleigh', '2120', 'NSW', -33.721399, 151.078813, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/237'),
  ('The Badminton Club Wetherill Park', '196 Newton Rd, Wetherill Park NSW 2164', 'Wetherill Park', '2164', 'NSW', -33.838056, 150.882222, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/213'),
  ('Marrara Indoor Stadium', '10 Abala Rd, Marrara NT 0812', 'Marrara', '0812', 'NT', -12.399547, 130.882141, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/228'),
  ('Smashminton', '2/26 Achievement Cres, Acacia Ridge QLD 4110', 'Acacia Ridge', '4110', 'QLD', -27.581787, 153.011856, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/233'),
  ('Carrara Indoor Sports Stadium', '296 Nerang Broadbeach Rd, Carrara QLD 4211', 'Carrara', '4211', 'QLD', -28.005684, 153.365263, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/207'),
  ('Coomera Indoor Sports Centre', '35 Beattie Rd, Coomera QLD 4209', 'Coomera', '4209', 'QLD', -27.866546, 153.319753, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/209'),
  ('IBC Coopers Plains | International Badminton Centre', '4/260 Musgrave Rd, Coopers Plains QLD 4108', 'Coopers Plains', '4108', 'QLD', -27.560341, 153.036233, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/218'),
  ('VBC / Vision Badminton Centre', '37A Turbo Dr, Coorparoo QLD 4151', 'Coorparoo', '4151', 'QLD', -27.492432, 153.049782, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/235'),
  ('Brisbane Badminton', '39 Quilton Pl, Crestmead QLD 4132', 'Crestmead', '4132', 'QLD', -27.691910, 153.072136, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/232'),
  ('Morayfield Sport & Events Centre', 'Morayfield Park Leisure Centre, 298 Morayfield Rd, Morayfield QLD 4506', 'Morayfield', '4506', 'QLD', -27.116956, 152.949576, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/214'),
  ('Sam''s Indoor Sports Centre', '137 Bage St, Nundah QLD 4012', 'Nundah', '4012', 'QLD', -27.408159, 153.057037, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/225'),
  ('Logan Badminton & Court Hire', '2 Alfred St, Slacks Creek QLD 4127', 'Slacks Creek', '4127', 'QLD', -27.652975, 153.160898, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/231'),
  ('Star Badminton Centre', '6 Pinter Dr, Southport QLD 4215', 'Southport', '4215', 'QLD', -27.974636, 153.409838, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/224'),
  ('Ingle Farm Recreation Centre', '3/58 Beovich Rd, Ingle Farm SA 5098', 'Ingle Farm', '5098', 'SA', -34.831944, 138.649167, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/210'),
  ('South Australian Badminton Association', '42 Rutland Ave, Lockleys SA 5032', 'Lockleys', '5032', 'SA', -34.930825, 138.523569, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/229'),
  ('South Australia Badminton College', 'The Gdns, Parafield Gardens SA 5107', 'Parafield Gardens', '5107', 'SA', -34.781848, 138.601393, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/238'),
  ('Adelaide Badminton Centre', '60 Hardys Rd, Torrensville SA 5031', 'Torrensville', '5031', 'SA', -34.918155, 138.554442, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/212'),
  ('ABC- Abbotsford Badminton Club', '18 Flockhart St, Abbotsford VIC 3067', 'Abbotsford', '3067', 'VIC', -37.809485, 145.007744, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/195'),
  ('Melbourne Sports and Aquatic Centre@ MSAC', '30 Aughtie Dr, Albert Park', 'Albert Park', '3206', 'VIC', -37.842100, 144.962000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/41'),
  ('Altona Badminton Centre - WSBA Inc', '217 Mason Street', 'Altona North', '3025', 'VIC', -37.840580, 144.857998, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/45'),
  ('Ararat & District Badminton Association', 'Alexandra Hall, Ararat VIC 3377', 'Ararat', '3377', 'VIC', -37.283300, 142.933300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/182'),
  ('East Gippsland Badminton', '93 McKean Street, Bairnsdale VIC 3875', 'Bairnsdale', '3875', 'VIC', -37.833300, 147.616700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/189'),
  ('ACM Sports', '493 Mountain Hwy, Bayswater VIC 3153', 'Bayswater', '3153', 'VIC', -37.843332, 145.246920, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/254'),
  ('VBVA Geelong', '2 Anakie Road, Bell Post Hill VIC 3215', 'Bell Post Hill', '3215', 'VIC', -38.100000, 144.333300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/144'),
  ('Benalla Badminton Association Inc', 'Ackerley Ave, Benalla VIC 3672', 'Benalla', '3672', 'VIC', -36.550000, 145.983300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/176'),
  ('Melbourne Badminton Centre', '16 Joseph Street', 'Blackburn North', '3130', 'VIC', -37.799510, 145.144072, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/65'),
  ('RecWest Braybrook', '39 Lily St, Braybrook VIC 3019', 'Braybrook', '3019', 'VIC', -37.783506, 144.848527, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/263'),
  ('Camperdown Badminton Association', 'C/- 27 Cressy Street, Camperdown VIC 3260', 'Camperdown', '3260', 'VIC', -38.233300, 143.150000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/172'),
  ('Caroline Springs Leisure Centre', 'Leisure Centre, Caroline Springs Leisure Centre The Parade, Caroline Springs VIC 3023', 'Caroline Springs', '3023', 'VIC', -37.733041, 144.738754, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/266'),
  ('Castlemaine Badminton Club', 'McGrath Street, Castlemaine VIC 3450', 'Castlemaine', '3450', 'VIC', -37.066700, 144.216700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/160'),
  ('Charlton Badminton Club', 'Davies Street, Charlton VIC 3525', 'Charlton', '3525', 'VIC', -36.266700, 143.350000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/187'),
  ('Beyond Badminton Centre', '6 Torteval Pl, Clayton VIC 3168', 'Clayton', '3168', 'VIC', -37.928533, 145.134565, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/247'),
  ('Beyond Badminton Centre - BBC', '6 Torteval PI, Clayton VIC 3168', 'Clayton', '3168', 'VIC', -37.928533, 145.134565, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/82'),
  ('Pro Fit Badminton', '86-102 Whiteside Road', 'Clayton South', '3169', 'VIC', -37.939256, 145.124524, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/84'),
  ('Panther Sports Centre', '7 Palladium Cct, Clyde North VIC 3978', 'Clyde North', '3978', 'VIC', -38.092370, 145.335045, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/251'),
  ('Sports Arena Clyde North', '31 Palladium Cct, Clyde North VIC 3978', 'Clyde North', '3978', 'VIC', -38.092401, 145.337298, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/136'),
  ('Cobblebank Indoor Stadium (MCBC)', '25 Stadium Drive', 'Cobblebank', '3338', 'VIC', -37.715297, 144.598274, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/124'),
  ('Colac Ladies Daytime Badminton', 'Bruce Street, Colac VIC 3250', 'Colac', '3250', 'VIC', -38.333300, 143.583300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/166'),
  ('Indoor Sports Arena', 'Unit 2/22-36 Reservoir Dr, Coolaroo VIC 3048', 'Coolaroo', '3048', 'VIC', -37.642557, 144.932220, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/267'),
  ('Craigieburn Sports Stadium', '127/141 Craigieburn Rd, Craigieburn VIC 3064', 'Craigieburn', '3064', 'VIC', -37.599115, 144.934982, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/260'),
  ('Tennton', '65a Yellowbox Dr, Craigieburn VIC 3064', 'Craigieburn', '3064', 'VIC', -37.615688, 144.940811, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/264'),
  ('Sportz Kingdom ( Coming Soon )', '7 Palomo Drive, Cranbourne West VIC 3977', 'Cranbourne West', '3977', 'VIC', -38.083681, 145.244055, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/130'),
  ('Diamond Creek Community Centre', '28 Main Hurstbridge Road', 'Diamond Creek', '3089', 'VIC', -37.674149, 145.155809, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/96'),
  ('Doncaster Badminton Centre', 'Hummel Way, Doncaster, VIC 3108 (Access via JJ Tully Drive)', 'Doncaster', '3108', 'VIC', -37.786500, 145.130655, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/64'),
  ('Doncaster East Badminton Centre', '350 Blackburn Rd, Doncaster East VIC 3109', 'Doncaster East', '3109', 'VIC', -37.775879, 145.165374, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/277'),
  ('Drouin Badminton Club', '24 Sinclair Street, Drouin VIC 3818', 'Drouin', '3818', 'VIC', -38.133300, 145.850000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/151'),
  ('Bendigo Eaglehawk Badminton Association', '40 Victoria Street, Eaglehawk VIC 3556', 'Eaglehawk', '3556', 'VIC', -36.716700, 144.250000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/167'),
  ('Ellinbank Badminton Club', '18 Community Place, Ellinbank VIC 3821', 'Ellinbank', '3821', 'VIC', -38.233300, 145.933300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/156'),
  ('Endeavour Hills Leisure Centre', '10 Raymond McMahon Blvd, Endeavour Hills VIC 3802', 'Endeavour Hills', '3802', 'VIC', -37.978001, 145.259872, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/250'),
  ('Fawkner Leisure Centre', '79/83 Jukes Road, Fawkner VIC 3060', 'Fawkner', '3060', 'VIC', -37.703088, 144.968752, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/58'),
  ('Monash Sport', 'Monash Peninsula Activity & Recreation Centre, Frankston VIC 3199', 'Frankston', '3199', 'VIC', -38.153628, 145.136240, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/255'),
  ('Mornington Peninsula Badminton Inc.', '3/97 Foot St, Frankston VIC 3199', 'Frankston', '3199', 'VIC', -38.162321, 145.130082, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/259'),
  ('Frankston South Community and Recreation Centre', 'Unit 2/55 Towerhill Rd, Frankston South VIC 3199', 'Frankston South', '3199', 'VIC', -38.161263, 145.127280, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/252'),
  ('Gladstone Park Community Centre', '9 South Circular Road', 'Gladstone Park', '3043', 'VIC', -37.686924, 144.886655, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/66'),
  ('Diamond Valley Badminton Association', '44 Civic Drive, Greensborough, VIC 3088', 'Greensborough', '3088', 'VIC', -37.689662, 145.111027, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/73'),
  ('Badminton Connect Hallam', '22 Technology Circuit', 'Hallam', '3803', 'VIC', -38.009994, 145.259471, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/123'),
  ('Bayside Badminton Club Inc', '221 Thomas Street, Hampton VIC 3188', 'Hampton', '3188', 'VIC', -37.939848, 145.017772, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/63'),
  ('Maroondah Nets', '154 Heathmont Rd, Heathmont VIC 3135', 'Heathmont', '3135', 'VIC', -37.835230, 145.255620, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/246'),
  ('Heidelberg Badminton Centre', 'U3, 661 Waterdale Rd entrance on Northern Rd', 'Heidelberg West', '3081', 'VIC', -37.729792, 145.049465, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/54'),
  ('Horsham Badminton Club', 'Baillie Street, Horsham VIC 3400', 'Horsham', '3400', 'VIC', -36.716700, 142.200000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/193'),
  ('Keilor Basketball Netball Stadium', '135 Stadium Dr, Keilor Park VIC 3042', 'Keilor Park', '3042', 'VIC', -37.713286, 144.848203, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/206'),
  ('Hawthorn Badminton Club / Xavier College Burke Hall', '2 Nolan Avenue, Kew VIC 3101', 'Kew', '3101', 'VIC', -37.809000, 145.034500, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/42'),
  ('Springers Leisure Centre', '400 Cheltenham Rd, Keysborough VIC 3173', 'Keysborough', '3173', 'VIC', -37.996154, 145.154226, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/258'),
  ('Yu Lin Badminton Club', '44-52 Henderson Rd, Keysborough VIC 3173', 'Keysborough', '3173', 'VIC', -37.981637, 145.159636, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/249'),
  ('Kilsyth Sports Centre', '115 Liverpool Road', 'Kilsyth', '3137', 'VIC', -37.812225, 145.317793, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/119'),
  ('Mountain District Badminton Association', '115 Liverpool Rd, Kilsyth VIC 3137', 'Kilsyth', '3137', 'VIC', -37.812022, 145.316366, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/245'),
  ('Kyabram Badminton', '7 Unwin St, Kyabram VIC 3620', 'Kyabram', '3620', 'VIC', -36.316700, 145.050000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/175'),
  ('Kyneton Badminton Association', '4 Victoria Street, Kyneton VIC 3444', 'Kyneton', '3444', 'VIC', -37.250000, 144.450000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/147'),
  ('Gippsland Junior Badminton Association', '440 Labertouche Rd, Labertouche VIC 3816', 'Labertouche', '3816', 'VIC', -38.100000, 145.866700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/149'),
  ('Peak Play Badminton', '50E Cherry Lane, Laverton North, VIC 3026', 'Laverton', '3026', 'VIC', -37.834703, 144.800660, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/60'),
  ('Leongatha Badminton Club', 'Eca Centre, Leongatha VIC 3953', 'Leongatha', '3953', 'VIC', -38.483300, 145.950000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/162'),
  ('Macedon Community Centre  (Macedon Ranges Badminton Club)', '37 Waterfalls Rd, Macedon VIC 3440', 'Macedon', '3440', 'VIC', -37.417413, 144.572439, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/141'),
  ('Mansfield Badminton Association', '35 Highett Street, Mansfield VIC 3722', 'Mansfield', '3722', 'VIC', -37.050000, 146.083300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/164'),
  ('Maribyrnong College / Play Badminton', 'Maribyrnong College, River Street, Maribyrnong VIC 3032', 'Maribyrnong', '3032', 'VIC', -37.778024, 144.889050, 'openstreetmap', 'https://www.badmintonhub.com.au/venues/43'),
  ('Badminton Court', 'Badminton Ct, Marshall VIC 3216', 'Marshall', '3216', 'VIC', -38.189121, 144.354826, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/197'),
  ('Squash Logic', '63 Reserve Rd, Melton VIC 3337', 'Melton', '3337', 'VIC', -37.687111, 144.587922, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/276'),
  ('Mirboo North Badminton Association', 'Castle Street, Mirboo North VIC 3871', 'Mirboo North', '3871', 'VIC', -38.400000, 146.166700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/163'),
  ('Mitcham Badminton', 'Unit 1/613 Whitehorse Rd, Mitcham VIC 3132', 'Mitcham', '3132', 'VIC', -37.815211, 145.203752, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/216'),
  ('Civic Reserve Recreation Centre', '350 Dunns Rd, Mornington VIC 3931', 'Mornington', '3931', 'VIC', -38.237236, 145.053348, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/262'),
  ('Melbourne Unique Badminton Centre', 'Suite 1, Building 2/88 Ricketts Rd, Mount Waverley VIC 3149', 'Mount Waverley', '3149', 'VIC', -37.896937, 145.140831, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/67'),
  ('Mt Waverley Badminton Centre (MWBC)', '59/170 Forster Rd, Mount Waverley VIC 3149', 'Mount Waverley', '3149', 'VIC', -37.896752, 145.133250, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/196'),
  ('Victory Badminton Centre', '11/13 Glenvale Cres, Mulgrave VIC 3170', 'Mulgrave', '3170', 'VIC', -37.921039, 145.159918, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/234'),
  ('Badminton Connect', '450 Princes Highway ,Noble Park North,  VIC, 3174', 'Noble Park North', '3174', 'VIC', -37.956922, 145.185721, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/103'),
  ('Nunawading Community Hub', '96-106 Springvale Rd, Nunawading VIC 3131', 'Nunawading', '3131', 'VIC', -37.814973, 145.176134, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/72'),
  ('Ocean Grove Badminton', '123 The Avenue, Ocean Grove VIC 3226', 'Ocean Grove', '3226', 'VIC', -38.266700, 144.516700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/145'),
  ('Officer Community Hub', '2 Parker St, Officer VIC 3809', 'Officer', '3809', 'VIC', -38.070968, 145.411769, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/269'),
  ('Cardinia Life', '4/6 Olympic Way, Pakenham VIC 3810', 'Pakenham', '3810', 'VIC', -38.064562, 145.458411, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/261'),
  ('Champions Arena Pakenham', '15 Jersey Rd, Pakenham VIC 3810', 'Pakenham', '3810', 'VIC', -38.104107, 145.480738, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/270'),
  ('Kangaroo Indoor Sports', '147 Mulcahy Rd, Pakenham VIC 3810', 'Pakenham', '3810', 'VIC', -38.058479, 145.464523, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/271'),
  ('Sports Arena Pakenham', '14/99 Bald Hill Rd, Pakenham VIC 3810', 'Pakenham', '3810', 'VIC', -38.088179, 145.501170, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/142'),
  ('Melbourne University Badminton Club', '103 Tin Alley, Parkville VIC 3010', 'Parkville', '3010', 'VIC', -37.796360, 144.960652, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/19'),
  ('ACM Sports Point Cook', '16 Wallace Avenue', 'Point Cook', '3030', 'VIC', -37.872567, 144.742556, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/88'),
  ('Stormers Badminton Center', '11 Waigani Ave, Ravenhall VIC 3023', 'Ravenhall', '3023', 'VIC', -37.765503, 144.754571, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/268'),
  ('Darebin Community Sports Stadium', '857 Plenty Rd, Reservoir VIC 3073', 'Reservoir', '3073', 'VIC', -37.721568, 145.029904, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/265'),
  ('PBC - PICKLEBALL & BADMINTON CENTRE', 'Unit 4/3B Newlands Rd, Reservoir VIC 3073', 'Reservoir', '3073', 'VIC', -37.718297, 144.980344, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/272'),
  ('VBVA Sale Maffra', '116 Cobains Road, Sale VIC 3850', 'Sale', '3850', 'VIC', -38.100000, 147.066700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/180'),
  ('VBVA Shepparton', 'Numurkah Rd, Shepparton VIC 3630', 'Shepparton', '3630', 'VIC', -36.383300, 145.400000, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/174'),
  ('Mornington Peninsula Badminton - Somerville Recreation Centre', '14 Edward St, Somerville VIC 3912', 'Somerville', '3912', 'VIC', -38.225185, 145.172675, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/139'),
  ('Energy Badminton Centre (EBC)', '2/4 Brough St, Springvale VIC 3171', 'Springvale', '3171', 'VIC', -37.941795, 145.169842, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/253'),
  ('Sunbury Recreation Stadium (Sunbury Badminton Club)', '47 Riddell Road,Sunbury VIC, 3429', 'Sunbury', '3429', 'VIC', -37.572275, 144.722984, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/127'),
  ('Sunshine Badminton', '45 Bunnett Street', 'Sunshine North', '3020', 'VIC', -37.761742, 144.840531, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/57'),
  ('Terang Badminton Club', '134 High Street, Terang VIC 3264', 'Terang', '3264', 'VIC', -38.233300, 142.916700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/179'),
  ('Narrandjeri Stadium', '281 Darebin Rd, Thornbury VIC 3071', 'Thornbury', '3071', 'VIC', -37.763678, 145.023912, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/275'),
  ('Timboon & District Badminton Association', '11 Hamilton Street, Timboon VIC 3268', 'Timboon', '3268', 'VIC', -38.483300, 142.983300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/183'),
  ('Surf Coast Badminton Association', 'Surfcoast Highway, Torquay VIC 3228', 'Torquay', '3228', 'VIC', -38.333300, 144.316700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/148'),
  ('Latrobe Valley Badminton Association', 'Catterick Crescent, Traralgon VIC 3840', 'Traralgon', '3840', 'VIC', -38.200000, 146.533300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/169'),
  ('Badminton Connect Truganina', '4 Infinity Drive', 'Truganina', '3029', 'VIC', -37.835310, 144.745924, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/75'),
  ('Vermont Badminton Centre', '159 Rooks Rd, Vermont VIC 3133', 'Vermont', '3133', 'VIC', -37.833528, 145.189166, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/256'),
  ('Wangaratta Badminton Club', '344 Wangaratta-Whitfield Rd, Wangaratta VIC 3677', 'Wangaratta', '3677', 'VIC', -36.350000, 146.316700, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/185'),
  ('Badminton Court', 'Badminton Ct, Wantirna VIC 3152', 'Wantirna', '3152', 'VIC', -37.849473, 145.230175, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/198'),
  ('Warragul Badminton Club', '19 Galloway St, Warragul VIC 3820', 'Warragul', '3820', 'VIC', -38.166700, 145.933300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/155'),
  ('Warrnambool Stadium', '71-77 Caramut Rd, Warrnambool VIC 3280', 'Warrnambool', '3280', 'VIC', -38.353655, 142.461124, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/244'),
  ('Ballarat Badminton Association Inc', '407 Dowling Street, Wendouree VIC 3355', 'Wendouree', '3355', 'VIC', -37.533300, 143.833300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/158'),
  ('Wonthaggi And District Badminton Association Inc.', '41 Wentworth Road, Wonthaggi VIC 3995', 'Wonthaggi', '3995', 'VIC', -38.600000, 145.583300, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/157'),
  ('Perth Badminton Arena Canning Vale', '21 Bannister Rd, Canning Vale WA 6155', 'Canning Vale', '6155', 'WA', -32.060930, 115.929192, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/223'),
  ('Cannington Leisureplex', 'Wharf St &, Sevenoaks St, Cannington WA 6107', 'Cannington', '6107', 'WA', -32.010517, 115.940636, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/273'),
  ('KG Badminton HQ | Perth', '35 Edison Cct, Forrestdale WA 6112', 'Forrestdale', '6112', 'WA', -32.136693, 115.961432, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/227'),
  ('Striker Indoor Sports and Fitness', '55 Farrington Rd, Leeming WA 6149', 'Leeming', '6149', 'WA', -32.077337, 115.856094, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/215'),
  ('Kingsway Indoor Stadium', 'Kingsway Indoor Stadium, Level 1/130 Kingsway, Madeley WA 6065', 'Madeley', '6065', 'WA', -31.813829, 115.834217, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/217'),
  ('The RISE', '28 Eighth Ave, Maylands WA 6051', 'Maylands', '6051', 'WA', -31.931044, 115.894857, 'badmintonhub', 'https://www.badmintonhub.com.au/venues/274')
) as v (name, street, suburb, postcode, state, lat, lng, coordinates_source, source_url)
cross join lateral (
  select su.suburb_id
  from public.suburb su
  where lower(su.name) = lower(v.suburb) and su.state_code = v.state
  order by (su.postcode = v.postcode) desc, su.postcode
  limit 1
) s
on conflict (name, suburb_id) do update
  set address = excluded.address,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      coordinates_source = excluded.coordinates_source,
      source_url = excluded.source_url;

-- Every listed venue must have found its suburb; a silent drop would lose it.
do $$
begin
  if (select count(*) from public.venue where source_url like 'https://www.badmintonhub.com.au/venues/%') < 142 then
    raise exception 'venue seed: some venues did not match a suburb';
  end if;
end $$;
