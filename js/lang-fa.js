/* Persian vocabulary + text normalisation for search */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});

  const families = {
    'Wood & Root': 'چوب و ریشه', 'White Bloom': 'شکوفه سفید', 'Petal Garden': 'باغ گلبرگ', 'Sunlit Citrus': 'مرکبات آفتابی',
    'Green Leaf': 'برگ سبز', 'Velvet Sweet': 'شیرینی مخملی', 'Spice Route': 'راه ادویه', 'Orchard Fruit': 'میوه باغی',
    'Amber & Resin': 'عنبر و رزین', 'Powder Veil': 'نقاب پودری', 'Skin Musk': 'مشک پوستی', 'Smoke & Leather': 'دود و چرم',
    'Salt & Mineral': 'نمک و معدنی', 'Oud Court': 'دربار عود'
  };
  // hue (0-360) per family — drives the generated bottle artwork when a photo is not available yet
  const hues = {
    'Wood & Root': 28, 'White Bloom': 335, 'Petal Garden': 350, 'Sunlit Citrus': 46, 'Green Leaf': 135, 'Velvet Sweet': 18,
    'Spice Route': 10, 'Orchard Fruit': 4, 'Amber & Resin': 38, 'Powder Veil': 285, 'Skin Musk': 24, 'Smoke & Leather': 210,
    'Salt & Mineral': 195, 'Oud Court': 268
  };
  const chars = {
    floral: 'گلی', warm: 'گرم', citrusy: 'مرکباتی', fresh: 'تازه', sweet: 'شیرین', spicy: 'ادویه‌ای', woody: 'چوبی', fruity: 'میوه‌ای',
    earthy: 'خاکی', creamy: 'خامه‌ای', herbal: 'گیاهی', powdery: 'پودری', resinous: 'رزینی', musky: 'مشکی', green: 'سبز',
    amber: 'عنبری', smoky: 'دودی', clean: 'پاک', salty: 'شور', leathery: 'چرمی', rich: 'غنی'
  };
  const seasons = { spring: 'بهار', summer: 'تابستان', autumn: 'پاییز', winter: 'زمستان' };
  const times = { day: 'روز', evening: 'عصر', night: 'شب' };
  const conc = {
    'eau-de-parfum': 'ادو پرفیوم', 'eau-de-toilette': 'ادو تویلت', extrait: 'اکستریت', parfum: 'پرفیوم',
    'eau-de-cologne': 'ادو کلن', elixir: 'الکسیر'
  };
  const status = { owned: 'دارم', wishlist: 'می‌خواهم بخرم', tested: 'تست کردم', sold: 'فروختم' };

  // Notes — curated Persian names (keys lower-case). Covers ~99% of note occurrences in the dataset.
  const notes = {
    'musk': 'مشک', 'vanilla': 'وانیل', 'bergamot': 'برگاموت', 'patchouli': 'پچولی', 'rose': 'گل رز', 'jasmine': 'یاسمن',
    'cedarwood': 'چوب سدر', 'sandalwood': 'چوب صندل', 'amber': 'عنبر', 'vetiver': 'وتیور', 'mandarin': 'نارنگی',
    'tonka bean': 'لوبیا تونکا', 'lemon': 'لیمو', 'orange blossom': 'شکوفه پرتقال', 'lavender': 'اسطوخودوس',
    'pink pepper': 'فلفل صورتی', 'iris': 'ایریس', 'cardamom': 'هل', 'leather': 'چرم', 'oakmoss': 'خزه بلوط', 'pepper': 'فلفل',
    'geranium': 'شمعدانی', 'oud': 'عود', 'saffron': 'زعفران', 'grapefruit': 'گریپ‌فروت', 'orange': 'پرتقال', 'apple': 'سیب',
    'cinnamon': 'دارچین', 'violet': 'بنفشه', 'blackcurrant': 'انگور فرنگی سیاه', 'ginger': 'زنجبیل', 'ylang-ylang': 'یلانگ‌یلانگ',
    'labdanum': 'لابدانوم', 'benzoin': 'بنزوئین', 'pear': 'گلابی', 'peach': 'هلو', 'neroli': 'نرولی', 'nutmeg': 'جوز هندی',
    'ambroxan': 'آمبروکسان', 'lily of the valley': 'موگه', 'frankincense': 'کندر', 'tuberose': 'مریم', 'ambergris': 'عنبر خاکستری',
    'incense': 'بخور', 'mint': 'نعناع', 'raspberry': 'تمشک', 'peony': 'پیونی', 'jasmine sambac': 'یاسمن سامباک', 'sage': 'مریم‌گلی',
    'woody notes': 'نت‌های چوبی', 'juniper': 'عرعر', 'tobacco': 'تنباکو', 'magnolia': 'ماگنولیا', 'pineapple': 'آناناس',
    'cashmere wood': 'چوب کشمیر', 'gardenia': 'گاردنیا', 'heliotrope': 'هلیوتروپ', 'petitgrain': 'پتی‌گرین', 'coconut': 'نارگیل',
    'plum': 'آلو', 'caramel': 'کارامل', 'citrus': 'مرکبات', 'lychee': 'لیچی', 'clary sage': 'کلاری سیج', 'guaiac wood': 'چوب گایاک',
    'freesia': 'فریزیا', 'almond': 'بادام', 'coriander': 'گشنیز', 'tea': 'چای', 'violet leaf': 'برگ بنفشه', 'rosemary': 'رزماری',
    'wood': 'چوب', 'honey': 'عسل', 'myrrh': 'مر', 'cypress': 'سرو', 'coffee': 'قهوه', 'amberwood': 'چوب عنبر', 'osmanthus': 'اسمانتوس',
    'clove': 'میخک', 'fig': 'انجیر', 'lime': 'لیموترش', 'basil': 'ریحان', 'orchid': 'ارکیده', 'praline': 'پرالین', 'lily': 'سوسن',
    'sea notes': 'نت‌های دریایی', 'spice': 'ادویه', 'green leaves': 'برگ‌های سبز', 'honeysuckle': 'پیچ امین‌الدوله',
    'cashmeran': 'کشمران', 'suede': 'جیر', 'ambrette': 'آمبرت', 'rum': 'رام', 'cypriol': 'سیپریول', 'elemi': 'المی',
    'chocolate': 'شکلات', 'strawberry': 'توت‌فرنگی', 'cherry': 'گیلاس', 'bitter orange': 'نارنج', 'carnation': 'گل میخک',
    'blood orange': 'پرتقال خونی', 'floral notes': 'نت‌های گلی', 'galbanum': 'گالبانوم', 'anise': 'انیسون', 'aldehydes': 'آلدهیدها',
    'daffodil': 'نرگس', 'passion fruit': 'میوه شور', 'melon': 'خربزه', 'mango': 'انبه', 'artemisia': 'درمنه',
    'white flowers': 'گل‌های سفید', 'akigalawood': 'آکیگالاوود', 'fir balsam': 'بلسان صنوبر', 'aquatic accord': 'آکورد آبی',
    'blackberry': 'تمشک سیاه', 'turkish rose': 'گل رز ترکی', 'lotus': 'لوتوس', 'thyme': 'آویشن', 'opoponax': 'اوپوپوناکس',
    'balsam of peru': 'بلسان پرو', 'sugar': 'شکر', 'fruit': 'میوه', 'mimosa': 'میموزا', 'rhubarb': 'ریواس', 'angelica': 'آنژلیکا',
    'lavandin': 'لاواندین', 'white woods': 'چوب‌های سفید', 'davana': 'داوانا', 'apricot': 'زردآلو', 'papyrus': 'پاپیروس',
    'pimento': 'پیمنتو', 'birch': 'توس', 'water lily': 'نیلوفر آبی', 'marigold': 'گل همیشه‌بهار', 'lilac': 'یاس بنفش',
    'cyclamen': 'سیکلامن', 'marshmallow': 'مارشمالو', 'salt': 'نمک', 'ambrofix': 'آمبروفیکس', 'maté': 'ماته', 'yuzu': 'یوزو',
    'rosewood': 'روزوود', 'frangipani': 'فرانژیپانی', 'cumin': 'زیره سبز', 'absinthe': 'آبسنت', 'red berries': 'توت‌های قرمز',
    'verbena': 'وربنا', 'spicy notes': 'نت‌های ادویه‌ای', 'liquorice': 'شیرین‌بیان', 'brown sugar': 'شکر قهوه‌ای', 'chestnut': 'شاه‌بلوط',
    'styrax': 'استیراکس', 'cut grass': 'چمن تازه‌چیده', 'hazelnut': 'فندق', 'oakwood': 'چوب بلوط', 'tarragon': 'ترخون',
    'hedione': 'هدیون', 'dates': 'خرما', 'toffee': 'تافی', 'bay': 'برگ بو', 'hyacinth': 'سنبل', 'civet': 'زباد', 'pine': 'کاج',
    'powdery notes': 'نت‌های پودری', 'coumarin': 'کومارین', 'resins': 'رزین‌ها', 'wild berries': 'توت‌های وحشی',
    'immortelle': 'گل جاودان', 'cognac': 'کنیاک', 'sichuan pepper': 'فلفل سیچوان', 'pistachio': 'پسته', 'pomegranate': 'انار',
    'amyris': 'آمیریس', 'chamomile': 'بابونه', 'palo santo': 'پالو سانتو', 'chantilly': 'کرم شانتیی', 'red currant': 'انگور فرنگی قرمز',
    'tiaré': 'تیاره', 'apple blossom': 'شکوفه سیب', 'carrot seed': 'دانه هویج', 'hay': 'علف خشک', 'teak wood': 'چوب ساج',
    'hibiscus': 'هیبیسکوس', 'myrtle': 'مورد', 'caraway': 'کاروی', 'cetalox': 'ستالوکس', 'dried fruits': 'میوه‌های خشک',
    'broom': 'ژنیستا', 'champagne': 'شامپاین', 'milk': 'شیر', 'lichen': 'گلسنگ', 'ebony wood': 'چوب آبنوس', 'petalia': 'پتالیا',
    'pine needle': 'سوزن کاج', 'mushroom': 'قارچ', 'mahonial': 'ماهونیال', 'blueberry': 'بلوبری', 'calone': 'کالون',
    'hawthorn': 'زالزالک', 'litsea': 'لیتسیا', 'almond milk': 'شیر بادام', 'mahogany': 'چوب ماهون', 'olive tree': 'درخت زیتون',
    'driftwood': 'چوب ساحلی', 'mineral accord': 'آکورد معدنی', 'animalic notes': 'نت‌های حیوانی', 'algae': 'جلبک',
    'rice powder': 'پودر برنج', 'amaretto': 'آمارتو', 'bamboo': 'بامبو', 'georgywood': 'جورجی‌وود', 'aromatic notes': 'نت‌های معطر',
    'turmeric': 'زردچوبه', 'cedrat': 'ترنج', 'sesame': 'کنجد', 'poppy': 'شقایق', 'red pepper': 'فلفل قرمز', 'cade': 'کید',
    'fern': 'سرخس', 'sand': 'ماسه', 'dragon fruit': 'میوه اژدها', 'datura flower': 'گل داتوره', 'gourmand accord': 'آکورد خوراکی',
    'red fruits': 'میوه‌های قرمز', 'pear blossom': 'شکوفه گلابی', 'laurel leaf': 'برگ غار', 'cherry blossom': 'شکوفه گیلاس',
    'birch woods': 'چوب توس', 'amaryllis': 'آماریلیس', 'sweet pea': 'نخود معطر', 'oregano': 'مرزنجوش', 'blonde woods': 'چوب‌های روشن',
    'shiso': 'شیسو', 'smoked tea': 'چای دودی', 'blackcurrant leaf': 'برگ انگور فرنگی سیاه', 'guava': 'گواوا', 'champaca': 'چمپاکا',
    'tomato leaf': 'برگ گوجه‌فرنگی', 'lactones': 'لاکتون‌ها', 'mastic': 'مصطکی', 'popcorn': 'پاپ‌کورن', 'ice cream': 'بستنی',
    'wisteria': 'ویستریا', 'maple': 'افرا', 'castoreum': 'کاستوریوم', 'night blooming jasmine': 'یاس شب‌بو', 'black ink': 'جوهر سیاه',
    'whisky': 'ویسکی', 'naseberry': 'نیزبری', 'clearwood': 'کلیر‌وود', 'raspberry blossom': 'شکوفه تمشک', 'mandora': 'ماندورا',
    'santolina': 'سانتولینا', 'pomarose': 'پومارز', 'dry wood': 'چوب خشک', 'pittosporum': 'پیتوسپوروم', 'green pear': 'گلابی سبز',
    'ambermax': 'آمبرمکس', 'sylkolide': 'سیلکولاید', 'transluzone': 'ترنسلوزون', 'panna cotta': 'پانا کوتا', 'mignonette': 'مینیونت',
    'rosehip': 'نسترن', 'peach blossom': 'شکوفه هلو', 'nectarine': 'شفتالو', 'carrot': 'هویج', 'bubble gum': 'آدامس بادکنکی',
    'water fruits and flowers': 'میوه‌ها و گل‌های آبی', 'clover': 'شبدر', 'vegetal accord': 'آکورد گیاهی', 'boronia': 'بورونیا',
    'ivy': 'پیچک', 'tulip': 'لاله', 'milk mousse': 'موس شیر', 'muscone': 'موسکون', 'aquatic flowers': 'گل‌های آبی',
    'lorenox': 'لورنوکس', 'calypsone': 'کالیپسون', 'meringue': 'مرنگ', 'ambrettolide': 'آمبرتولید', 'cactus': 'کاکتوس',
    'beeswax': 'موم زنبور', 'quince': 'به', 'schinus molle': 'فلفل پرویی', 'lemongrass': 'علف‌لیمو', 'campanula': 'کامپانولا',
    'fresh cotton': 'پنبه تازه', 'fig wood': 'چوب انجیر', 'cotton candy': 'پشمک', 'ambrocenide': 'آمبروسنید', 'orcanox': 'ارکانوکس',
    'caviar': 'خاویار', 'crème brûlée': 'کرم برولی', 'passion flower': 'گل ساعت', 'speculoos': 'اسپکولوس',
    'gurjum balsam': 'بلسان گورجوم', 'ultravanil': 'اولتراوانیل', 'cold spices': 'ادویه‌های خنک', 'sycamore wood': 'چوب چنار',
    'coco de mer': 'کوکو دو مر', 'crystal moss': 'خزه بلورین', 'queen of the night flower': 'گل ملکه شب', 'buchu': 'بوچو',
    'african marigold': 'همیشه‌بهار آفریقایی', 'dry timberwood': 'چوب خشک', 'rangoon creeper': 'پیچ رانگون', 'blue ginger': 'زنجبیل آبی',
    'tropical fruits': 'میوه‌های استوایی', 'basil verbena': 'ریحان و وربنا', 'fresh wind': 'باد تازه', 'flax flower': 'گل کتان',
    'ginger lily': 'سوسن زنجبیلی', 'salty vanilla': 'وانیل شور', 'oolong tea': 'چای اولانگ', 'white currant': 'انگور فرنگی سفید',
    'red seaweed': 'جلبک قرمز', 'maninka fruit': 'میوه مانینکا', 'gunpowder': 'باروت', 'transparent wood': 'چوب شفاف',
    'candied citrus': 'مرکبات شیرین‌شده'
  };

  const AR = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'ؤ': 'و' };
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[يكةۀأإؤ]/g, c => AR[c])
      .replace(/[ً-ٰٟـ‌‍]/g, '')
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
      .replace(/[-_&.,]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const fa = n => Number(n || 0).toLocaleString('fa-IR');

  LPF.fa = {
    families, hues, chars, seasons, times, conc, status, notes, norm, num: fa,
    note: n => notes[String(n).toLowerCase()] || '',
    family: f => families[f] || f || '',
    char: c => chars[c] || c,
    season: s => seasons[s] || s,
    time: t => times[t] || t,
    concentration: c => conc[c] || (c || '').replace(/-/g, ' '),
    hue: f => (hues[f] != null ? hues[f] : 38)
  };
})();
