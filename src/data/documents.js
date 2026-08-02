export const documents = [
  {
    id: "petycja-25-07-2026",
    title: "Petycja z 25 lipca 2026 r.",
    shortTitle: "Treść petycji",
    description:
      "Petycja o przywrócenie w Górnośląskim Centrum Zdrowia Dziecka w Katowicach leczenia dzieci z guzami mózgu i innymi guzami litymi.",
    type: "PDF",
    date: "25 lipca 2026",
    dateISO: "2026-07-25",
    href: "/documents/04-petycja-25-07-2026.pdf",
    featuredOnHome: true
  },
  {
    id: "interwencja-parlamentarzystow-17-07-2026",
    title: "Interwencja parlamentarzystów z 17 lipca 2026 r.",
    shortTitle: "Interwencja parlamentarzystów",
    description:
      "Dokument dotyczący interwencji posłów i senatorów w sprawie funkcjonowania dziecięcej onkologii i hematologii na Górnym Śląsku.",
    type: "PDF",
    date: "17 lipca 2026",
    dateISO: "2026-07-17",
    href: "/documents/02-interwencja-parlamentarzystow-17-07-2026.pdf",
    featuredOnHome: true
  },
  {
    id: "oswiadczenie-lekarzy-09-07-2026",
    title: "Oświadczenie lekarzy z 9 lipca 2026 r.",
    shortTitle: "Oświadczenie lekarzy z 9 lipca 2026",
    description:
      "Oświadczenie lekarzy odnoszące się do bezpieczeństwa leczenia, zaplecza specjalistycznego oraz organizacji opieki nad dziećmi.",
    type: "PDF",
    date: "9 lipca 2026",
    dateISO: "2026-07-09",
    href: "/documents/03-oswiadczenie-lekarzy-09-07-2026.pdf",
    featuredOnHome: true
  },
  {
    id: "pismo-lekarzy-30-06-2026",
    title: "Pismo lekarzy z 30 czerwca 2026 r.",
    shortTitle: "Pismo lekarzy z 30 czerwca 2026",
    description:
      "Pismo lekarzy dotyczące organizacji leczenia dzieci onkologicznych oraz zmian związanych z przeniesieniem świadczeń z Górnośląskiego Centrum Zdrowia Dziecka w Katowicach.",
    type: "PDF",
    date: "30 czerwca 2026",
    dateISO: "2026-06-30",
    href: "/documents/01-pismo-lekarzy-30-06-2026.pdf",
    featuredOnHome: true
  }
];

export const homeDocuments = documents
  .filter((document) => document.featuredOnHome)
  .sort(
    (a, b) =>
      new Date(b.dateISO).getTime() -
      new Date(a.dateISO).getTime()
  )
  .slice(0, 4);