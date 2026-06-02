create unique index if not exists salon_leads_place_id_unique
  on salon_leads(google_place_id)
  where google_place_id is not null;

create unique index if not exists salon_leads_phone_city_unique
  on salon_leads(phone, city)
  where phone is not null
    and city is not null
    and length(phone) >= 10;
