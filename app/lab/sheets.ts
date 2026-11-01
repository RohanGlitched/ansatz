/**
 * The pendulum worksheet, two printed pages, in English and Hindi. Both languages have the same keys, the same number
 * of lines in every list and the same {placeholders} (test/lab-worksheet.test.ts), so a line can't go missing in one.
 * It carries no measured numbers: the student writes their own.
 */

export type Sheet = {
  lang: "en" | "hi";
  kicker: string;
  page: string;
  title: string;
  refs: string;
  fields: string[];
  aimH: string;
  aim: string;
  needH: string;
  need: string;
  filmH: string;
  film: string[];
  tableH: string;
  cols: string[];
  runLine: string;
  graphH: string;
  graphs: string[];
  axes: string[];
  calcH: string;
  calc: string[];
  extH: string;
  ext: string[];
  qH: string;
  qs: string[];
  teacher: string[];
  foot: string;
};

export const SHEETS: Record<"en" | "hi", Sheet> = {
  en: {
    lang: "en",
    kicker: "Worksheet · Class XI Physics",
    page: "Page {n} of 2",
    title: "The simple pendulum, filmed",
    refs: "CBSE Class XI practicals, Section A, Experiment 7 (and Activity 7) · NCERT Laboratory Manual, Experiment E6 (and Activity A7)",
    fields: ["Name", "Class and section", "Roll no.", "Date", "Group"],
    aimH: "Aim",
    aim: "Using a simple pendulum, plot the L–T and L–T² graphs, find g from the slope, and hence the effective length of the seconds pendulum.",
    needH: "You need",
    need: "A heavy bob on a thread about 1.2 m long, a clamp stand, a metre scale, one sheet of A4 paper, sticky tape, a phone and a pile of books.",
    filmH: "Before you film, tick each box",
    film: [
      "Tape the A4 sheet flat on the wall behind the bob, long side level, in the plane of the swing.",
      "Measure L with the metre scale, from the point of suspension to the centre of the bob, and write it in the table.",
      "Prop the phone on the books 1.5 to 2 m away, level with the bob. It must not move while filming.",
      "Pull the bob aside by no more than a tenth of the length and let go. Film at least ten full swings.",
      "Say the length aloud as you film (“the thread is sixty centimetres”), in English or in Hindi.",
      "Upload the clip with your class link and choose “pendulum”. Repeat for four lengths.",
    ],
    tableH: "Table 1. Observations",
    cols: ["S. no.", "Length L (cm), by metre scale", "Period T from Ansatz (s)", "± on T (s)", "T² (s²)", "L / T² (m/s²)"],
    runLine: "Ansatz report links or run codes:",
    graphH: "Graphs",
    graphs: ["Graph 1. L against T", "Graph 2. L against T²"],
    axes: ["T (s)", "L (m)", "T² (s²)", "L (m)"],
    calcH: "Calculation",
    calc: [
      "Slope of the L–T² line = ________ m/s²",
      "g = 4π² × slope = ________ m/s²",
      "From Graph 2, at T² = 4 s² (T = 2 s), the effective length of the seconds pendulum L = ________ m",
      "Ansatz’s g for one of your clips = ________ ± ________ m/s². Do your g and Ansatz’s agree within the ±?   Yes / No",
    ],
    extH: "Extension: energy dissipated (Activity 7)",
    ext: [
      "From the same report, the damping rate γ = ________ 1/s.",
      "Energy goes as the amplitude squared and falls as exp(−γt). Time for the energy to halve = ln 2 / γ = ________ s.",
    ],
    qH: "Questions",
    qs: [
      "Ansatz fits each law to the first 70% of the swing and grades it on the last 30%. Why is that a fairer test than fitting all of it?",
      "Which numbers in your report were given (said or typed by you) and which were measured?",
      "Why must the swing be small for T = 2π√(L/g) to hold? What did the struck-through law on the class plate miss?",
      "Your L–T² line does not pass exactly through the origin. Give two reasons.",
    ],
    teacher: ["Teacher’s signature", "Marks"],
    foot: "Ansatz · ansatz-lab.vercel.app/lab · free to copy for any class",
  },
  hi: {
    lang: "hi",
    kicker: "कार्यपत्रक · कक्षा XI भौतिकी",
    page: "पृष्ठ {n} / 2",
    title: "सरल लोलक, वीडियो से",
    refs: "CBSE कक्षा XI प्रायोगिक कार्य, खंड A, प्रयोग 7 (और क्रियाकलाप 7) · NCERT प्रयोगशाला पुस्तिका, प्रयोग E6 (और क्रियाकलाप A7)",
    fields: ["नाम", "कक्षा और वर्ग", "अनुक्रमांक", "दिनांक", "समूह"],
    aimH: "उद्देश्य",
    aim: "सरल लोलक की सहायता से L–T तथा L–T² आलेख खींचना, ढाल से g ज्ञात करना, और इससे सेकंड लोलक की प्रभावी लंबाई ज्ञात करना।",
    needH: "आवश्यक सामग्री",
    need: "लगभग 1.2 m लंबे धागे से बँधा भारी गोलक, क्लैंप स्टैंड, मीटर पैमाना, A4 कागज़ की एक शीट, चिपकने वाला टेप, एक फ़ोन और कुछ किताबें।",
    filmH: "वीडियो बनाने से पहले, हर खाने में सही का निशान लगाएँ",
    film: [
      "A4 शीट को गोलक के पीछे दीवार पर, झूलने के तल में, लंबी भुजा क्षैतिज रखकर, समतल चिपकाएँ।",
      "मीटर पैमाने से L मापें, निलंबन बिंदु से गोलक के केंद्र तक, और उसे तालिका में लिखें।",
      "फ़ोन को किताबों पर 1.5 से 2 m दूर, गोलक की ऊँचाई पर टिकाएँ। वीडियो बनाते समय फ़ोन हिलना नहीं चाहिए।",
      "गोलक को लंबाई के दसवें भाग से अधिक न हटाएँ, फिर छोड़ दें। कम से कम दस पूरे दोलनों का वीडियो बनाएँ।",
      "वीडियो बनाते समय लंबाई बोलें (“धागे की लंबाई साठ सेंटीमीटर है”), हिंदी या अंग्रेज़ी में।",
      "क्लिप को अपनी कक्षा के लिंक से अपलोड करें और “pendulum” चुनें। चार लंबाइयों के लिए दोहराएँ।",
    ],
    tableH: "तालिका 1. प्रेक्षण",
    cols: ["क्रम सं.", "लंबाई L (cm), मीटर पैमाने से", "Ansatz से आवर्तकाल T (s)", "T पर ± (s)", "T² (s²)", "L / T² (m/s²)"],
    runLine: "Ansatz रिपोर्ट के लिंक या रन कोड:",
    graphH: "आलेख",
    graphs: ["आलेख 1. L और T", "आलेख 2. L और T²"],
    axes: ["T (s)", "L (m)", "T² (s²)", "L (m)"],
    calcH: "गणना",
    calc: [
      "L–T² रेखा की ढाल = ________ m/s²",
      "g = 4π² × ढाल = ________ m/s²",
      "आलेख 2 से, T² = 4 s² (T = 2 s) पर, सेकंड लोलक की प्रभावी लंबाई L = ________ m",
      "आपकी किसी एक क्लिप के लिए Ansatz का g = ________ ± ________ m/s²। क्या आपका g और Ansatz का g ± के भीतर मेल खाते हैं?   हाँ / नहीं",
    ],
    extH: "आगे: ऊर्जा का क्षय (क्रियाकलाप 7)",
    ext: [
      "उसी रिपोर्ट से, अवमंदन दर γ = ________ 1/s।",
      "ऊर्जा आयाम के वर्ग के अनुपाती है और exp(−γt) की तरह घटती है। ऊर्जा आधी होने का समय = ln 2 / γ = ________ s।",
    ],
    qH: "प्रश्न",
    qs: [
      "Ansatz हर नियम को दोलन के पहले 70% भाग पर आसंजित करता है और अंतिम 30% पर जाँचता है। पूरे भाग पर आसंजित करने की तुलना में यह परीक्षण अधिक निष्पक्ष क्यों है?",
      "आपकी रिपोर्ट में कौन-सी संख्याएँ दी गई थीं (आपने बोलीं या लिखीं) और कौन-सी मापी गईं?",
      "T = 2π√(L/g) के सही होने के लिए दोलन छोटा क्यों होना चाहिए? कक्षा की प्लेट पर कटा हुआ नियम क्या चूक गया?",
      "आपकी L–T² रेखा ठीक मूलबिंदु से होकर नहीं जाती। दो कारण बताइए।",
    ],
    teacher: ["शिक्षक के हस्ताक्षर", "अंक"],
    foot: "Ansatz · ansatz-lab.vercel.app/lab · किसी भी कक्षा के लिए मुफ़्त प्रतिलिपि",
  },
};
