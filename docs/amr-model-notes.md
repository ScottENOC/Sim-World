# Antimicrobial resistance model

The AMR system deliberately separates three concepts that can otherwise be conflated:

- pathogen immunity/recovery resistance in `disease.js`;
- antimicrobial drug resistance, tracked per bacterial pathogen and antibiotic class;
- veterinary disease pressure in the livestock model.

Human clinical use and livestock antibiotic pressure both contribute selection pressure. Stewardship, diagnostics, infection control, surveillance and livestock restrictions reduce that pressure or improve control. New reserve antibiotic classes restore some effectiveness temporarily, but can also lose effectiveness if use remains poorly controlled.

The model is strategic and population-level. It does not simulate drug synthesis, dosing, prescribing instructions or laboratory pathogen engineering.
