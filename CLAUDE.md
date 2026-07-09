# Project conventions

## SQL migrations

Elk `migration/*.sql`-bestand hoort een duidelijke naam te krijgen. Bij het geven
van SQL om in de Supabase SQL Editor te draaien: altijd expliciet vermelden welke
naam de gebruiker aan de query-tab moet geven vóór het uitvoeren (bijv. dezelfde
naam als het migratiebestand, zonder `.sql`). Zonder een naam blijft de query in
Supabase's editor-historie als "Untitled query" staan, wat de geschiedenis
onoverzichtelijk maakt na een aantal migraties.
