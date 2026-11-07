// Snapshot from DANA Beneficiary Bank Code List; review against DANA docs periodically.
// Source: https://dashboard.dana.id/api-docs-v2/api/disbursement/beneficiary-bank-code-list
// Format: bank name | bank code | SWIFT code. '-' means not published.
const BANK_ROWS = `
Bank BCA|014|CENAIDJA
Bank Mandiri|008|BMRIIDJA
Bank BNI|009|BNINIDJA
Bank Syariah Indonesia (eks BNI Syariah)|451|BSMDIDJA
Bank BRI|002|BRINIDJA
Bank Syariah Indonesia (eks Mandiri Syariah)|451|BSMDIDJA
Bank CIMB Niaga|022|BNIAIDJA
Bank CIMB Niaga Syariah|022|SYNAIDJ1
Bank Muamalat|147|MUABIDJA
Bank Tabungan Pensiunan Nasional (BTPN)|213|SUNIIDJA
JENIUS|213|SUNIIDJA
Bank Syariah Indonesia (eks BRI Syariah)|451|BSMDIDJA
Bank Tabungan Negara (BTN)|200|BTANIDJA
Permata Bank|013|BBBAIDJA
Bank Danamon|011|BDINIDJA
Bank BII Maybank|016|IBBKIDJA
Bank Mega|426|MEGAIDJA
Bank Sinarmas|153|SBJKIDJA
Bank Commonwealth|950|BICNIDJA
Bank OCBC NISP|028|NISPIDJA
Bank Bukopin|441|BBUKIDJA
Bank Syariah Indonesia|451|BSMDIDJA
Bank BCA Syariah|536|BSYAIDJA
Citibank|031|CITIIDJX
Bank Ekspor Indonesia|003|-
Bank Panin|019|PINBIDJA
Bank Arta Niaga Kencana|026|-
Bank Jabar dan Banten (BJB)|110|PDJBIDJA
Bank DKI|111|BDKIIDJ1
BPD DIY|112|PDYKIDJ1
Bank Jateng|113|PDJGIDJ1
Bank Jatim|114|PDJTIDJ1
BPD Jambi|115|PDJMIDJ1
BPD Aceh, BPD Aceh Syariah|116|SYACIDJ1
Bank Sumut|117|PDSUIDJ1
Bank Nagari|118|PDSBIDJ1
Bank Riau|119|PDRIIDJA
Bank Sumsel Babel|120|BSSPIDSP
Bank Lampung|121|PDLPIDJ1
Bank Kalsel (Kalimantan Selatan)|122|PDKSIDBB
Bank Kalbar (Kalimantan Barat)|123|PDKBIDJ1
Bank Kaltimtara (Kalimantan Timur dan Utara)|124|PDKTIDJ1
Bank Kalteng (Kalimantan Tengah)|125|PDKGIDJ1
Bank Sulselbar (Sulawesi Selatan dan Barat)|126|PDWSIDJA
Bank SulutGo (Sulawesi Utara dan Gorontalo)|127|PDWUIDJ1
Bank NTB, NTB Syariah|128|PDNBIDJ1
BPD Bali|129|ABALIDBS
Bank NTT|130|PDNTIDJA
Bank Maluku Malut|131|PDMLIDJ1
Bank Papua|132|PDIJIDJ1
Bank Bengkulu|133|PDBKIDJ1
Bank Sulteng (Sulawesi Tengah)|134|PDWGIDJ1
Bank Sultra|135|PDWRIDJ1
Bank UOB Indonesia|023|BBIJIDJA
American Express Bank LTD|030|-
Citibank N.A|031|CITIIDJX
JP. Morgan Chase Bank, N.A|032|-
Bank of America, N.A|033|BOFAID2X
ING Indonesia Bank|034|-
Bank Artha Graha Internasional|037|ARTGIDJA
Bank Credit Agricole Indosuez|039|-
The Bangkok Bank Comp. LTD|040|-
The Hongkong & Shanghai B.C. (Bank HSBC)|041|-
The Bank of Tokyo Mitsubishi UFJ LTD|042|BOTKIDJX
Bank Sumitomo Mitsui Indonesia|045|-
Bank DBS Indonesia|046|DBSBIDJA
Bank Resona Perdania|047|BPIAIDJA
Bank Mizuho Indonesia|048|-
Standard Chartered Bank|050|SCBLIDJX
Bank ABN Amro|052|-
Bank Keppel Tatlee Buana|053|-
Bank Capital Indonesia|054|BCIAIDJA
Bank BNP Paribas Indonesia|057|BNPAIDJA
Korea Exchange Bank Danamon|059|-
Bank BJB Syariah|425|SYJBIDJ1
Bank ANZ Indonesia|061|ANZBIDJX
Deutsche Bank AG.|067|DEUTIDJA
Bank Woori Indonesia|068|-
Bank Of China|069|BKCHIDJA
Bank Bumi Arta|076|BBAIIDJA
Bank Ekonomi|087|HSBCIDJA
Bank Antardaerah|088|-
Bank Haga|089|RABOIDJA
Bank IFI|093|-
Bank JTRUST|095|CICTIDJA
Bank Mayapada|097|MAYAIDJA
Bank Nusantara Parahyangan|145|-
Bank of India Indonesia|146|SWBAIDJ1
Bank Mestika Dharma|151|MEDHIDS1
Bank Metro Express (Bank Shinhan Indonesia)|152|-
Bank Maspion Indonesia|157|MASDIDJ1
Bank Hagakita|159|-
Bank Ganesha|161|GNESIDJA
Bank Windu Kentjana|162|-
Halim Indonesia Bank (Bank ICBC Indonesia)|164|ICBKIDJA
Bank Harmoni International|166|-
Bank QNB Kesawan (Bank QNB Indonesia)|167|AWANIDJA
Bank Himpunan Saudara 1906|212|BSDRIDJA
Bank Swaguna|405|-
Bank Bisnis Internasional|459|BUSTIDJ1
Bank Sri Partha|466|-
Bank Jasa Jakarta|472|JSABIDJ1
Bank Bintang Manunggal|484|HNBNIDJA
Bank MNC / Bank Bumiputera|485|BUMIIDJA
Bank Yudha Bhakti|490|YUDBIDJ1
Bank BRI Agro|494|AGTBIDJA
Bank Indomonex (Bank SBI Indonesia)|498|IDMOIDJ1
Bank Royal Indonesia|501|BBLUIDJA
Bank Alfindo (Bank National Nobu)|503|NOBUIDJA
Bank Syariah Mega|506|BUTGIDJ1
Bank Ina Perdana|513|IAPTIDJA
Bank Harfa|517|ARFAIDJ1
Prima Master Bank|520|PMASIDJ1
Bank Persyarikatan Indonesia|521|-
Bank Dipo International (Bank Sahabat Sampoerna)|523|SAHMIDJA
Bank Akita|525|-
Liman International Bank|526|-
Anglomas Internasional Bank|531|-
Bank Kesejahteraan Ekonomi|535|SSPIIDJA
Bank Artos IND|542|JAGBIDJA
Bank Purba Danarta|547|PUBAIDJ1
Bank Multi Arta Sentosa|548|BMSEIDJA
Bank Mayora Indonesia|553|MAYOIDJA
Bank Index Selindo|555|BIDXIDJA
Centratama Nasional Bank|559|-
Bank Fama Internasional|562|FAMAIDJ1
Bank Mandiri Taspen Pos|564|SIHBIDJ1
Bank Victoria International|566|VICTIDJ1
Bank Harda|567|ALOBIDJA
BPR KS|688|-
Bank Agris|945|AGSSIDJA
Bank Merincorp|946|-
Bank Maybank Indocorp|947|NETBIDJA
Bank OCBC – Indonesia|948|-
Bank CTBC (China Trust) Indonesia|949|CTCBIDJA
Bank CCB Indonesia|036|MCORIDJA
BPD Banten|137|PDBBIDJ1
Bank Danamon Syariah|722|SYBDIDJ1
Bank DKI UUS Syariah|724|SYDKIDJ1
Bank Jateng UUS Syariah|725|SYJGIDJ1
Bank Nano Syariah|734|NANOIDJ1
Permata Syariah|013|SYBBIDJ1
Maybank Syariah|016|SYBKIDJ1
OCBC NISP UUS Syariah|028|SYONIDJ1
BPD DIY UUS|112|SYYKIDJ1
BPD Jatim UUS Syariah|114|SYJTIDJ1
Jambi UUS Syariah|115|SYJMIDJ1
Sumut UUS Syariah|117|SYSUIDJ1
Nagari UUS Syariah|118|SYSBIDJ1
Sumsel Babel UUS Syariah|120|SYSSIDJ1
Kalsel UUS Syariah|122|SYKSIDJ1
Kalbar UUS Syariah|123|SYKBIDJ1
Kaltim dan Kaltara UUS Syariah|124|SYKTIDJ1
Sulselbar UUS Syariah|126|SYWSIDJ1
BTN UUS Syariah|200|SWAGIDJ1
Jago Syariah|542|SYATIDJ1
`;

export const DANA_BENEFICIARY_BANKS = Object.freeze(
  BANK_ROWS.trim()
    .split("\n")
    .map((line, index) => {
      const [bank_name, bank_code, swift_code] = line.split("|");
      return Object.freeze({
        id: index + 1,
        bank_name: bank_name.trim(),
        bank_code: bank_code.trim(),
        swift_code: swift_code.trim() === "-" ? null : swift_code.trim(),
      });
    }),
);
