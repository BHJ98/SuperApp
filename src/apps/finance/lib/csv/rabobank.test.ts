import { describe, it, expect } from "vitest";
import { parseRabobankCSV } from "./rabobank";

const HEADER =
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initierende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"';

function row(opts: {
  seq: string;
  date: string;
  amount: string;
  cpName?: string;
  cpIban?: string;
  desc1?: string;
}): string {
  return [
    "NL00RABO0123456789",
    "EUR",
    "RABONL2U",
    opts.seq,
    opts.date,
    opts.date,
    opts.amount,
    "1000,00",
    opts.cpIban ?? "",
    opts.cpName ?? "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    opts.desc1 ?? "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]
    .map((v) => `"${v}"`)
    .join(",");
}

describe("parseRabobankCSV", () => {
  it("parses valid rows with Dutch decimal commas", async () => {
    const csv = [
      HEADER,
      row({ seq: "1", date: "2024-05-01", amount: "-12,50", cpName: "Albert Heijn", desc1: "Boodschappen" }),
      row({ seq: "2", date: "2024-05-02", amount: "2500,00", cpName: "Werkgever", desc1: "Salaris" }),
    ].join("\n");

    const { transactions, errors, accountIban } = await parseRabobankCSV(csv);
    expect(errors).toHaveLength(0);
    expect(transactions).toHaveLength(2);
    expect(transactions[0].amount).toBeCloseTo(-12.5);
    expect(transactions[0].counterparty_name).toBe("Albert Heijn");
    expect(transactions[1].amount).toBeCloseTo(2500);
    expect(accountIban).toBe("NL00RABO0123456789");
  });

  it("produces a stable, unique import_hash per row", async () => {
    const csv = [
      HEADER,
      row({ seq: "1", date: "2024-05-01", amount: "-12,50", desc1: "X" }),
    ].join("\n");
    const a = await parseRabobankCSV(csv);
    const b = await parseRabobankCSV(csv);
    expect(a.transactions[0].import_hash).toBe(b.transactions[0].import_hash);
    expect(a.transactions[0].import_hash).toMatch(/^rabo_/);
  });

  it("flags creditcard transactions as transfers", async () => {
    const csv = [
      HEADER,
      row({ seq: "1", date: "2024-05-01", amount: "-300,00", desc1: "ICS Creditcard afschrijving kaartnummer 1234" }),
    ].join("\n");
    const { transactions } = await parseRabobankCSV(csv);
    expect(transactions[0].is_transfer).toBe(true);
  });

  it("collects an error for an invalid amount but keeps going", async () => {
    const csv = [
      HEADER,
      row({ seq: "1", date: "2024-05-01", amount: "niet-een-getal", desc1: "X" }),
      row({ seq: "2", date: "2024-05-02", amount: "-5,00", desc1: "Y" }),
    ].join("\n");
    const { transactions, errors } = await parseRabobankCSV(csv);
    expect(transactions).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("errors clearly when the file is not a Rabobank export", async () => {
    const csv = "foo,bar\n1,2";
    const { transactions, errors } = await parseRabobankCSV(csv);
    expect(transactions).toHaveLength(0);
    expect(errors.join(" ")).toMatch(/Rabobank/i);
  });
});
