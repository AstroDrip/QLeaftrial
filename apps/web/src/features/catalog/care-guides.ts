// Longer advice shown under a care value on the product page. It explains what the shop's standard wording means
// in a home in Qatar; it never adds a fact about one particular plant. Light and watering are matched on the exact
// English wording the shop uses (any other wording gets no advice), care level and placement on their fixed values.
type Guide = { en: string; ar: string };

const light: Record<string, Guide> = {
  "bright indirect": {
    en: "Somewhere close to a bright window, but out of the sun's direct rays. A metre or two back from a south- or west-facing window works, or right behind a sheer curtain. Qatar sun coming straight through the glass can scorch the leaves within days. If the light is too weak, growth slows and new stems stretch out.",
    ar: "مكان قريب من نافذة مشرقة، بعيدًا عن أشعة الشمس المباشرة. يناسبها أن تكون على بعد متر أو مترين من نافذة جنوبية أو غربية، أو خلف ستارة شفافة. شمس قطر المباشرة عبر الزجاج قد تحرق الأوراق خلال أيام، وإذا كان الضوء ضعيفًا يتباطأ نموها وتستطيل سيقانها الجديدة.",
  },
  "medium indirect": {
    en: "Happy in the middle of a well-lit room, a few metres from the window, or next to a north-facing one. Keep direct sun off the leaves. If new leaves come in small or pale, or the stems lean hard towards the window, move it a little closer to the light.",
    ar: "ترتاح في وسط غرفة جيدة الإضاءة، على بعد أمتار قليلة من النافذة، أو بجانب نافذة شمالية. أبعد أشعة الشمس المباشرة عن أوراقها. إذا خرجت الأوراق الجديدة صغيرة أو باهتة، أو مالت السيقان بقوة نحو النافذة، فقرّبها قليلًا من الضوء.",
  },
  "low to bright indirect": {
    en: "One of the easier plants to place. It copes with a dim corner or a hallway lit by a window further away, and grows faster with more light. Keep it out of direct sun. In a darker spot it drinks less, so give the soil a little longer to dry between waterings.",
    ar: "من أسهل النباتات في اختيار مكانها. تتحمل زاوية خافتة أو ممرًا يصله الضوء من نافذة بعيدة، وتنمو أسرع كلما زاد الضوء. أبعدها عن الشمس المباشرة. وفي المكان الأقل إضاءة تحتاج ماءً أقل، فاترك التربة تجف وقتًا أطول قليلًا بين الريّات.",
  },
  "full sun": {
    en: "Needs several hours of direct sun a day: a sunny balcony or terrace, or right up against your brightest window. Without it the plant grows thin and leggy. Afternoon sun in a Qatar summer is fierce, so if the leaves start to bleach or brown, give it some shade in the hottest hours.",
    ar: "تحتاج إلى عدة ساعات من الشمس المباشرة يوميًا: شرفة أو تراس مشمس، أو بجوار أكثر نوافذك إضاءة. من دون ذلك يصبح نموها ضعيفًا ومتطاولًا. شمس الظهيرة في صيف قطر قاسية، فإذا بدأت الأوراق تبهت أو تسمرّ، وفّر لها بعض الظل في أشد ساعات الحر.",
  },
};

const watering: Record<string, Guide> = {
  "water when the top few centimetres of soil are dry": {
    en: "Push a finger into the soil up to the second knuckle. If it feels dry, water slowly until water runs out of the drainage hole, then empty the saucer. In an air-conditioned room that is often about once a week, less in the cooler months. Go by the soil, not the calendar.",
    ar: "اغرس إصبعك في التربة حتى المفصل الثاني. إذا شعرت بأنها جافة، فاسقِ ببطء حتى يخرج الماء من فتحة التصريف، ثم أفرغ الصحن. في غرفة مكيفة يكون ذلك غالبًا مرة في الأسبوع تقريبًا، وأقل في الأشهر الباردة. اعتمد على حالة التربة لا على التقويم.",
  },
  "keep the soil lightly moist, never waterlogged": {
    en: "The soil should feel like a wrung-out sponge: damp, but never soggy and never bone dry. Water a little whenever the surface starts to dry, and don't leave the pot standing in water. Crisp, curling leaf edges mean it went too dry. Yellow leaves and a sour smell usually mean too wet.",
    ar: "يجب أن تكون التربة مثل إسفنجة معصورة: رطبة، لكن غير مشبعة بالماء ولا جافة تمامًا. اسقِ قليلًا كلما بدأ سطحها يجف، ولا تترك الأصيص واقفًا في الماء. حواف الأوراق الجافة الملتفة تعني أنها عطشت، أما الأوراق الصفراء والرائحة الحامضة فتعني غالبًا ماءً زائدًا.",
  },
  "water sparingly and let the soil dry out completely between waterings": {
    en: "This plant stores water in its leaves, stems or roots, so it needs far less than most. Wait until the soil is dry all the way down, then water well and let it drain. Too much water is what usually goes wrong: soft or mushy stems and leaves are the sign to hold back.",
    ar: "يخزن هذا النبات الماء في أوراقه أو سيقانه أو جذوره، لذا يحتاج إلى ماء أقل بكثير من معظم النباتات. انتظر حتى تجف التربة بالكامل حتى القاع، ثم اسقِ جيدًا ودع الماء الزائد يتصرف. الإفراط في الري هو المشكلة الأكثر شيوعًا، والسيقان أو الأوراق اللينة علامة على أن تقلل الري.",
  },
  "water deeply, then let the top layer dry before watering again": {
    en: "Give it a long drink, enough to soak the whole root ball and run out of the bottom of the pot, then wait for the top layer of soil to dry before the next one. Deep, less frequent watering grows stronger roots than a small splash every day. Outdoors in summer heat, that point comes sooner.",
    ar: "اسقِها ريًّا غزيرًا يكفي لتشبّع كتلة الجذور كلها حتى يخرج الماء من أسفل الأصيص، ثم انتظر حتى تجف الطبقة العليا من التربة قبل الريّة التالية. الري العميق المتباعد يقوّي الجذور أكثر من رشّة صغيرة كل يوم. وفي الخارج خلال حر الصيف، تجف التربة أسرع.",
  },
};

const careLevel: Record<string, Guide> = {
  easy: {
    en: "A good pick if you're new to plants or travel often. It forgives the odd missed watering and doesn't need misting, special feeding or daily attention. Get the light and watering right and it will mostly look after itself.",
    ar: "اختيار مناسب إذا كنت جديدًا على النباتات أو تسافر كثيرًا. تتحمل نسيان الري أحيانًا، ولا تحتاج إلى رذاذ أو تسميد خاص أو اهتمام يومي. وفّر لها الإضاءة والري المناسبين، وستعتني بنفسها في الغالب.",
  },
  moderate: {
    en: "It forgives a little neglect but shows it when it's been forgotten. Check on it once or twice a week, stick to the light and watering above, and turn the pot every few weeks so it grows evenly. A few minutes a week is usually enough.",
    ar: "ليست صعبة، لكنها تتأثر بالإهمال. تفقّدها مرة أو مرتين في الأسبوع، والتزم بالإضاءة والري المذكورين أعلاه، وأدر الأصيص كل بضعة أسابيع لينمو النبات بشكل متوازن. بضع دقائق في الأسبوع تكفي عادة.",
  },
  demanding: {
    en: "A fussy plant that dislikes cold air-conditioning draughts, dry air and soil that swings between bone dry and soaking. Give it a steady spot away from vents, and keep it near other plants or on a tray of wet pebbles to raise the humidity around its leaves.",
    ar: "نبتة حساسة لا تحب تيار هواء المكيف البارد، ولا الهواء الجاف، ولا التربة التي تتقلب بين الجفاف التام والتشبع بالماء. ضعها في مكان ثابت بعيدًا عن فتحات التكييف، وقرّبها من نباتات أخرى أو ضعها على صينية فيها حصى مبلل لرفع الرطوبة حول أوراقها.",
  },
};

const placement: Record<string, Guide> = {
  indoor: {
    en: "This plant is grown to live indoors. Keep it away from air-conditioning vents and from doors that let in blasts of hot air. In a Qatar summer it shouldn't go outside: the heat and direct sun damage the leaves quickly.",
    ar: "مخصصة للعيش داخل المنزل. أبعدها عن فتحات التكييف وعن الأبواب التي يدخل منها الهواء الحار. ولا تخرجها في صيف قطر، فالحرارة والشمس المباشرة تتلف أوراقها بسرعة.",
  },
  outdoor: {
    en: "Best outside, on a terrace, balcony or in the garden, where it gets plenty of sun and fresh air. It won't do well kept indoors. In the hottest months it drinks more, so check the soil often and water early in the morning or in the evening.",
    ar: "أفضل مكان لها في الخارج، على تراس أو شرفة أو في الحديقة، حيث تحصل على الكثير من الشمس والهواء. لا تنمو جيدًا داخل المنزل. في أشد الأشهر حرارة تحتاج ماءً أكثر، فتفقّد التربة كثيرًا واسقِها في الصباح الباكر أو في المساء.",
  },
  "indoor-outdoor": {
    en: "Happy on a sunny windowsill or outside on a balcony or terrace. Outdoors it can take more sun, though some afternoon shade helps in July and August. When moving it from indoors into full sun, do it gradually over a week or two so the leaves don't burn.",
    ar: "ترتاح على حافة نافذة مشمسة أو في الخارج على شرفة أو تراس. في الخارج تتحمل شمسًا أكثر، لكن بعض الظل بعد الظهر يفيدها في يوليو وأغسطس. وعند نقلها من الداخل إلى الشمس الكاملة، افعل ذلك تدريجيًا خلال أسبوع أو أسبوعين حتى لا تحترق أوراقها.",
  },
};

const tables = { light, watering, care: careLevel, placement } as const;

// The Arabic product answer puts the Arabic wording in `light`, so the shop's Arabic standard phrases count too.
const arabicPhrases: Record<string, string> = {
  "إضاءة ساطعة غير مباشرة": "bright indirect",
  "إضاءة متوسطة غير مباشرة": "medium indirect",
  "إضاءة منخفضة إلى ساطعة غير مباشرة": "low to bright indirect",
  "شمس كاملة": "full sun",
  "اسقِ عندما تجف الطبقة العليا من التربة بعمق بضعة سنتيمترات": "water when the top few centimetres of soil are dry",
  "حافظ على رطوبة خفيفة في التربة دون أن تتشبع بالماء": "keep the soil lightly moist, never waterlogged",
  "اسقِ باعتدال واترك التربة تجف تمامًا بين الريّات": "water sparingly and let the soil dry out completely between waterings",
  "اسقِ بعمق ثم انتظر حتى تجف الطبقة العليا قبل الري التالي": "water deeply, then let the top layer dry before watering again",
};

/** The longer advice for one care row, or null when the shop's wording is not one of the standard phrases. */
export function careGuide(key: string, value: string | null | undefined, isArabic: boolean): string | null {
  const table = tables[key as keyof typeof tables];
  const phrase = value?.trim().toLowerCase() ?? "";
  const guide = table && phrase ? table[arabicPhrases[phrase] ?? phrase] : undefined;
  return guide ? guide[isArabic ? "ar" : "en"] : null;
}
