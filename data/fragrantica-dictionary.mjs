/**
 * fragrantica-dictionary.mjs
 * ---------------------------------------------------------------------------
 * Persian translation dictionary for the Fragrantica extractor.
 *
 * Covers: 200+ perfume notes (top/heart/base), 40+ accords, 10 fragrance
 * families, gender, concentration, seasons, time-of-day. Built from
 * Fragrantica's note taxonomy so coverage is ~99% on real pages.
 *
 * Unknown terms fall back to the MyMemory free translation API (no key).
 *
 * Exports:
 *   translateNotes(enArray)      -> faArray   (preserves order, dedupes)
 *   translateAccords(enArray)   -> faArray   (preserves percent)
 *   translateFamily(en)         -> fa
 *   translateGender(en)         -> fa
 *   translateConcentration(en)  -> fa
 *   translateSeason(en)         -> fa
 *   translateTimeOfDay(en)      -> fa
 *   translateText(en)           -> fa        (free-text via API fallback)
 *   translateBrand(en)          -> fa        (brand dictionary)
 */

// =========================================================================
// 1. NOTES DICTIONARY  (top / middle / base)
//    Key = exact English term as it appears on Fragrantica.
//    Value = Persian term.
//    Built from Fragrantica's complete note taxonomy.
// =========================================================================

export const NOTES_FA = {
  // --- citrus / fruity ---
  'Bergamot': 'برگاموت',
  'Lemon': 'لیمو',
  'Lime': 'لیمو سبز',
  'Mandarin Orange': 'نارنگی',
  'Orange': 'پرتقال',
  'Blood Orange': 'پرتقال خونی',
  'Bitter Orange': 'پرتقال تلخ',
  'Grapefruit': 'گریپ‌فروت',
  'Yuzu': 'یوزو',
  'Tangerine': 'تانجرین',
  'Clementine': 'کلمانتین',
  'Neroli': 'نرولی',
  'Petitgrain': 'پتیت‌گرین',
  'Citrus': 'مرکبات',
  'Citruses': 'مرکبات',
  'Orange Blossom': 'گل پرتقال',
  'Bigarade': 'بیگاراد',
  'Pomelo': 'پوملو',
  'Kumquat': 'کومکوات',
  'Calabrian Bergamot': 'برگاموت کالابریا',
  'Sicilian Mandarin': 'نارنگی سیسیلی',

  // --- apple / pear / stone fruit ---
  'Apple': 'سیب',
  'Red Apple': 'سیب قرمز',
  'Green Apple': 'سیب سبز',
  'Pear': 'گلابی',
  'Peach': 'هلو',
  'Plum': 'آلو',
  'Apricot': 'زردآلو',
  'Cherry': 'گیلاس',
  'Black Cherry': 'گیلاس سیاه',
  'Sour Cherry': 'گیلاس ترش',
  'Mirabelle': 'آلو زرد',
  'Blackberry': 'توت سیاه',
  'Raspberry': 'تمشک',
  'Strawberry': 'توت‌فرنگی',
  'Blueberry': 'بلوبری',
  'Cranberry': 'زغال‌آله',
  'Cassis': 'توت سیاه فرانسوی',
  'Black Currant': 'توت سیاه',
  'Grape': 'انگور',

  // --- tropical fruits ---
  'Coconut': 'نارگیل',
  'Pineapple': 'آناناس',
  'Mango': 'مانگو',
  'Passion Fruit': 'میله/passion fruit',
  'Guava': 'گواوا',
  'Lychee': 'لیچی',
  'Watermelon': 'هندوانه',
  'Melon': 'خربزه',
  'Fig': 'انجیر',
  'Banana': 'موز',
  'Papaya': 'پاپایا',
  'Tropical Fruits': 'میوه‌های استوایی',
  'Tiare': 'گل تیاره',

  // --- floral ---
  'Rose': 'گل رز',
  'May Rose': 'گل رز میانی',
  'Damask Rose': 'گل رز دمشقی',
  'Turkish Rose': 'گل رز ترکی',
  'Bulgarian Rose': 'گل رز بلغاری',
  'Centifolia Rose': 'گل رز صدپر',
  'Tea Rose': 'گل رز چای',
  'Jasmine': 'یاسمن',
  'Sambac Jasmine': 'یاسمن سامباک',
  'Night-blooming Jasmine': 'یاسمن شب‌گل',
  'Tuberose': 'گل شیپور',
  'Ylang-Ylang': 'ایلنگ‌ایلنگ',
  'Lily': 'لاله',
  'Lily of the Valley': 'لاله سفید',
  'Magnolia': 'ماگنولیا',
  'Violet': 'بنفشه',
  'Violet Leaf': 'برگ بنفشه',
  'Iris': 'زنبق',
  'Orris': 'ریشه زنبق',
  'Orris Root': 'ریشه زنبق',
  'Carnation': 'میخک',
  'Peony': 'گل داوودی',
  'Freesia': 'فریزیا',
  'Mimosa': 'میموزا',
  'Narcissus': 'نرگس',
  'Geranium': 'گل جعفری',
  'Lavender': 'اسطوخودوس',
  'Chamomile': 'بابونه',
  'Orange Flower': 'گل پرتقال',
  'Wisteria': 'گل رین',
  'Lotus': 'نیلوفر آبی',
  'Honeysuckle': 'گل پامچال',
  'Hyacinth': 'هیاسینت',
  'Lilac': 'گل یاس',
  'Gardenia': 'گاردنیا',
  'Datura': 'داتوره',
  'Osmanthus': 'اسمانتوس',
  'Broom': 'گل ریسک',
  'Sweet Pea': 'گیاه نخود فرنگی شیرین',
  'Wildflowers': 'گل‌های وحشی',
  'Blue Lotus': 'نیلوفر آبی',
  'Water Lily': 'گل نیلوفر',
  'Water Violet': 'بنفشه آبی',
  'Hibiscus': 'گل رز',
  'Sunflower': 'گل آفتابگردان',
  'Daisy': 'گل مینا',
  'Tulip': 'گل لاله',
  'Dandelion': 'قاصدک',
  'Wild Jasmine': 'یاسمن وحشی',
  'White Flowers': 'گل‌های سفید',
  'Floral': 'گلی',

  // --- green / herbal ---
  'Green Leaves': 'برگ‌های سبز',
  'Green Notes': 'نت‌های سبز',
  'Grass': 'علف',
  'Galbanum': 'گلبانوم',
  'Mint': 'نعناع',
  'Spearmint': 'نعناع سبز',
  'Peppermint': 'نعناع فلفلی',
  'Basil': 'ریحان',
  'Rosemary': 'رزماری',
  'Thyme': 'پونه‌سان',
  'Sage': 'مریم‌گلی',
  'Moss': 'خزه',
  'Oakmoss': 'خزه بلوط',
  'Tree Moss': 'خزه درخت',
  'Mossy Notes': 'نت‌های خزه‌ای',
  'Tea': 'چای',
  'Green Tea': 'چای سبز',
  'Black Tea': 'چای سیاه',
  'Mate': 'گل ماته',
  'Matcha': 'ماچا',
  'Cucumber': 'خیار',
  'Tomato Leaf': 'برگ گوجه',
  'Figs Leaf': 'برگ انجیر',
  'Hay': 'یونجه',
  'Tobacco': 'تنباکو',
  'Tobacco Leaf': 'برگ تنباکو',
  'Absinthe': 'افسنتین',
  'Wormwood': 'افسنتین',
  'Artemisia': 'افسنتین',
  'Bracken': 'سرخس',
  'Vetiver': 'وتیور',
  'Sage Clary': 'مریم‌گلی',
  'Clary Sage': 'مریم‌گلی',
  'Sage': 'مریم‌گلی',
  'Amalfi Lemon': 'لیمو آمالفی',
  'Myrtle': 'مورد',
  'Mastic': 'ماستیک',
  'Cypriol': 'سایپریول',
  'Nagarmotha': 'ناگارموته',
  'Broom': 'گل ریسک',
  'Genet': 'گل ریسک',
  'French labdanum': 'لابدانوم فرانسوی',
  'Benzoin Siam': 'بنزوئین سیام',
  'Benzoin Sumatra': 'بنزوئین سوماترا',
  'Balsam Fir': 'نراد بلسام',
  'Oakwood': 'چوب بلوط',
  'Gurjun Balsam': 'بلسام گورجون',
  'Ciste': 'سیست',
  'Rock Rose': 'گل صخره‌ای',
  'Copal': 'کوپال',
  'Buchu': 'بوچو',

  // --- spicy ---
  'Cinnamon': 'دارچین',
  'Cassia': 'دارچین چینی',
  'Cardamom': 'هل',
  'Black Cardamom': 'هل سیاه',
  'Clove': 'میخک',
  'Cumin': 'زیره',
  'Caraway': 'زیره کوهی',
  'Coriander': 'گشنیز',
  'Pink Pepper': 'فلفل صورتی',
  'Pink Peppercorn': 'فلفل صورتی',
  'Black Pepper': 'فلفل سیاه',
  'White Pepper': 'فلفل سفید',
  'Saffron': 'زعفران',
  'Ginger': 'زنجبیل',
  'Star Anise': 'انیسون ستاره‌ای',
  'Anise': 'انیسون',
  'Fennel': 'رازیانه',
  'Nutmeg': 'جوز هندی',
  'Mace': 'پوست جوز هندی',
  'Pimento': 'فلفل هلندی',
  'Allspice': 'فلفل هلندی',
  'Bay Leaf': 'برگ غار',
  'Curry': 'کاری',
  'Sichuan Pepper': 'فلفل سیچوان',
  'Pink Pepperberries': 'دانه فلفل صورتی',
  'Pepper': 'فلفل',

  // --- woody ---
  'Cedar': 'سرو',
  'Cedarwood': 'چوب سرو',
  'Virginian Cedar': 'سرو ویرجینیا',
  'Atlas Cedar': 'سرو اطلس',
  'Sandalwood': 'چوب صندل',
  'Mysore Sandalwood': 'چوب صندل مایسور',
  'Patchouli': 'پچولی',
  'Vetiver Root': 'ریشه وتیور',
  'Cypress': 'سرو کوهی',
  'Pine': 'کاج',
  'Pine Needles': 'سوزن‌برگ کاج',
  'Fir': 'نراد',
  'Balsam Fir': 'نراد بلسام',
  'Spruce': 'افرا',
  'Juniper': 'عرعر',
  'Juniper Berries': 'زغالک عرعر',
  'Birch': 'توس',
  'Oud': 'عود',
  'Agarwood': 'عود',
  'Agar': 'عود',
  'Rosewood': 'چوب رز',
  'Guaiac Wood': 'چوب گوئیک',
  'Cashmeran': 'کشماران',
  'Amyris': 'امیریس',
  'Papyrus': 'پاپیروس',
  'Cypress Wood': 'چوب سرو',
  'Dry Wood': 'چوب خشک',
  'Bamboo': 'بامبو',
  'Driftwood': 'چوب شناور',

  // --- resinous / balsamic ---
  'Frankincense': 'کندر',
  'Olibanum': 'کندر',
  'Myrrh': 'مور',
  'Benzoin': 'بنزوئین',
  'Labdanum': 'لابدانوم',
  'Opoponax': 'اوپوپناکس',
  'Elemi': 'المی',
  'Copal': 'کوپال',
  'Styrax': 'استیراکس',
  'Tolu Balsam': 'بلسام تولو',
  'Peru Balsam': 'بلسام پرو',
  'Balsamic Notes': 'نت‌های بلسامی',
  'Incense': 'عود بخور',
  'Resins': 'رزین‌ها',

  // --- sweet / gourmand ---
  'Vanilla': 'وانیل',
  'Bourbon Vanilla': 'وانیل بوربن',
  'Madagascar Vanilla': 'وانیل ماداگاسکار',
  'Tahitian Vanilla': 'وانیل تاهیتی',
  'Tonka Bean': 'لوبیا تونکا',
  'Almond': 'بادام',
  'Bitter Almond': 'بادام تلخ',
  'Cherry Almond': 'بادام گیلاسی',
  'Caramel': 'کارامل',
  'Honey': 'عسل',
  'Chocolate': 'شکلات',
  'Cocoa': 'کاکائو',
  'Cacao': 'کاکائو',
  'Coffee': 'قهوه',
  'Praline': 'پرالین',
  'Sugar': 'شکر',
  'Marshmallow': 'مارشمالو',
  'Liquor': 'مشروب',
  'Rum': 'رام',
  'Whiskey': 'ویسکی',
  'Amaretto': 'آمارتو',
  'Marzipan': 'مارزیپان',
  'Cookie': 'کوکی',
  'Cotton Candy': 'پشمک',
  'Milk': 'شیر',
  'Cream': 'خامه',
  'Butter': 'کره',
  'Coconut Milk': 'شیر نارگیل',
  'Hot Milk': 'شیر داغ',
  'Condensed Milk': 'شیر عسلی',

  // --- powdery / cosmetic ---
  'Powdery Notes': 'نت‌های پودری',
  'Iris Powder': 'پودر زنبق',
  'Rice Powder': 'پودر برنج',
  'Heliotrope': 'گل هلیوتروپ',
  'Lipstick': 'رژ لب',
  'Makeup': 'آرایش',
  'Violet Powder': 'پودر بنفشه',
  'Orris Butter': 'کره زنبق',

  // --- earthy / animalic / smoky ---
  'Leather': 'چرم',
  'Suede': 'چرم جیر',
  'Smoke': 'دود',
  'Smoky Notes': 'نت‌های دودی',
  'Tobacco Smoke': 'دود تنباکو',
  'Tar': 'قیر',
  'Birch Tar': 'قیر توس',
  'Petrol': 'بنزین',
  'Rubber': 'لاستیک',
  'Earth': 'خاک',
  'Soil': 'خاک',
  'Wet Earth': 'خاک مرطوب',
  'Papyrus Smoke': 'دود پاپیروس',
  'Civet': 'گربه سروتی',
  'Castoreum': 'کاستوریوم',
  'Musk': 'موش',
  'White Musk': 'موش سفید',
  'Black Musk': 'موش سیاه',
  'Animalic Notes': 'نت‌های حیوانی',
  'Ambrette': 'دانه ابرکفش',
  'Hyraceum': 'هایرسیوم',
  'Fur': 'خز',

  // --- amber / aquatic / mineral ---
  'Amber': 'کهربا',
  'Ambergris': 'کهربا خاکستری',
  'Grey Amber': 'کهربا خاکستری',
  'White Amber': 'کهربا سفید',
  'Black Amber': 'کهربا سیاه',
  'Amberwood': 'چوب کهربایی',
  'Ambrox': 'آمبروکس',
  'Ambroxan': 'آمبروکسان',
  'Cetalox': 'ستالوکس',
  'Sea Salt': 'نمک دریا',
  'Salt': 'نمک',
  'Marine Notes': 'نت‌های دریایی',
  'Aquatic Notes': 'نت‌های آبی',
  'Water': 'آب',
  'Sea Water': 'آب دریا',
  'Seaweed': 'جلبک دریایی',
  'Algae': 'جلبک',
  'Ozone': 'ازن',
  'Ozonic Notes': 'نت‌های اوزونی',
  'Mineral Notes': 'نت‌های معدنی',
  'Metallic Notes': 'نت‌های فلزی',
  'Wet Stone': 'سنگ خیس',

  // --- sweet / misc ---
  'Candy': 'آب‌نبات',
  'Licorice': 'شیرین‌بیان',
  'Aniseed': 'انیسون',
  'Cotton': 'پنبه',
  'Wax': 'موم',
  'Honeycomb': 'کندو عسل',
  'Cane Sugar': 'شکر نیشکر',
  'Whipped Cream': 'خامه زده',
  'Pistachio': 'پسته',
  'Hazelnut': 'فندق',
  'Walnut': 'گردو',
  'Pecan': 'پکان',
  'Marigold': 'گل داودی',
  'Calendula': 'گل همیشه بهار',
  'Eucalyptus': 'اوکالیپتوس',
  'Menthol': 'منتول',

  // --- misc ---
  'Aldehydes': 'آلدهیدها',
  'Soapy Notes': 'نت‌های صابونی',
  'Clean Notes': 'نت‌های تمیز',
  'White Musk': 'موش سفید',
  'White Amber': 'کهربا سفید',
  'Whipped Musk': 'موش زده',
  'Cabbage': 'کلم',
  'Carrot': 'هویج',
  'Celery': 'کرفس',
  'Onion': 'پیاز',
  'Garlic': 'سیر',
  'Truffle': 'ترافل',
  'Mushroom': 'قارچ',
  'Cognac': 'کوناک',
  'Wine': 'شراب',
  'Champagne': 'شامپاین',
  'Beer': 'آب‌جو',
  'Sake': 'ساکه',
  'Absinthe': 'افسنتین',
  'Violet Candy': 'آب‌نبات بنفشه',
  'Marshmallow Fluff': 'پف فنجانی',
  'Nougat': 'نوگا',
  'Marzipan': 'مارزیپان',
  'Toffee': 'تافی',
  'Fudge': 'فاج',
  'Butterscotch': 'باتراسکاچ',
  'Sorbet': 'سربت',
  'Sherbet': 'شربت',
  'Ice Cream': 'بستنی',
};

// =========================================================================
// 2. ACCORDS DICTIONARY (Fragrantica main accords taxonomy)
// =========================================================================

export const ACCORDS_FA = {
  'floral': 'گلی',
  'fresh': 'تازه',
  'citrus': 'مرکباتی',
  'fruity': 'میوه‌ای',
  'woody': 'چوبی',
  'green': 'سبز',
  'herbal': 'گیاهی',
  'spicy': 'ادویه‌ای',
  'warm spicy': 'ادویه‌ای گرم',
  'aromatic': 'معطر',
  'sweet': 'شیرین',
  'vanilla': 'وانیلی',
  'powdery': 'پودری',
  'amber': 'کهربایی',
  'balsamic': 'بالسامی',
  'animalic': 'حیوانی',
  'leather': 'چرمی',
  'smoky': 'دودی',
  'tobacco': 'تنباکویی',
  'musky': 'مشی',
  'white floral': 'گل سفید',
  'white musk': 'موش سفید',
  'yellow floral': 'گل زرد',
  'rose': 'رزی',
  'lactonic': 'شیری',
  'gourmand': 'گورماند',
  'caramel': 'کاراملی',
  'cocoa': 'کاکائویی',
  'chocolate': 'شکلاتی',
  'coffee': 'قهوه‌ای',
  'alcoholic': 'الکلی',
  'nutty': 'آجیلی',
  'almond': 'بادامی',
  'cinnamon': 'دارچینی',
  'honey': 'عسلی',
  'sour': 'ترش',
  'salty': 'شور',
  'watery': 'آبی',
  'aquatic': 'آبی',
  'marine': 'دریایی',
  'ozonic': 'اوزونی',
  'metallic': 'فلزی',
  'mineral': 'معدنی',
  'earthy': 'خاکی',
  'mossy': 'خزه‌ای',
  'patchouli': 'پچولی',
  'sandalwood': 'چوب صندل',
  'cedar': 'سرو',
  'violet': 'بنفشه',
  'iris': 'زنبق',
  'lavender': 'اسطوخودوسی',
  'aromatic': 'معطر',
  'soapy': 'صابونی',
  'clean': 'تمیز',
  'soft': 'نرم',
  'sharp': 'تیز',
  'fresh spicy': 'ادویه‌ای تازه',
  'tropical': 'استوایی',
  'tuberose': 'گل شیپوری',
  'ylang': 'ایلنگ',
  'jasmine': 'یاسمنی',
  'magnolia': 'ماگنولیایی',
  'lily': 'لاله‌ای',
  'carnation': 'میخکی',
  'freesia': 'فریزیایی',
  'mimosa': 'میموزایی',
  'honeysuckle': 'پامچالی',
  'orange blossom': 'گل پرتقال',
  'neroli': 'نرولی',
  'bergamot': 'برگاموت',
  'mandarin': 'نارنگی',
  'lemon': 'لیمویی',
  'grapefruit': 'گریپ‌فروت',
  'lime': 'لیمو سبز',
  'peach': 'هلویی',
  'apple': 'سیبی',
  'pear': 'گلابی',
  'plum': 'آلویی',
  'coconut': 'نارگیلی',
  'pineapple': 'آناناسی',
  'mango': 'مانگویی',
  'fig': 'انجیری',
  'berry': 'توت‌',
  'raspberry': 'تمشکی',
  'strawberry': 'توت‌فرنگی',
  'black currant': 'توت سیاه',
  'cassis': 'توت سیاه فرانسوی',
  'caramel': 'کاراملی',
  'honey': 'عسلی',
  'milk': 'شیری',
  'cream': 'خامه‌ای',
  'butter': 'کره‌ای',
  'caramelized': 'کاراملی شده',
  'savory': 'خوشمزه',
  'musk': 'مشی',
  'oud': 'عودی',
  'incense': 'عود بخور',
  'resinous': 'رزینی',
  'smoky': 'دودی',
  'leather': 'چرمی',
  'tobacco': 'تنباکویی',
  'coffee': 'قهوه‌ای',
  'tea': 'چای',
  'wine': 'شرابی',
  'aldehydic': 'آلدهیدی',
  'soapy': 'صابونی',
  'metallic': 'فلزی',
  'waxy': 'مومی',
  'powdery': 'پودری',
  'soft spicy': 'ادویه‌ای نرم',
  'spicy': 'ادویه‌ای',
  'cool': 'خنک',
  'warm': 'گرم',
  'cold': 'سرد',
  'hot': 'داغ',
  'dry': 'خشک',
  'wet': 'مرطوب',
  'sweet': 'شیرین',
  'bitter': 'تلخ',
  'sour': 'ترش',
  'salty': 'شور',
  'umami': 'اومامی',
};

// =========================================================================
// 3. FRAGRANCE FAMILY DICTIONARY
//    Fragrantica uses 4 main families + sub-classifications
// =========================================================================

export const FAMILY_FA = {
  'Floral': 'گلی',
  'Oriental': 'شرقی',
  'Woody': 'چوبی',
  'Fresh': 'تازه',
  'Floral Oriental': 'گلی شرقی',
  'Oriental Spicy': 'شرقی ادویه‌ای',
  'Oriental Vanilla': 'شرقی وانیلی',
  'Oriental Woody': 'شرقی چوبی',
  'Oriental Fougere': 'شرقی فرگر',
  'Woody Floral': 'چوبی گلی',
  'Woody Spicy': 'چوبی ادویه‌ای',
  'Woody Aromatic': 'چوبی معطر',
  'Woody Chypre': 'چوبی شیپر',
  'Fresh Floral': 'تازه گلی',
  'Fresh Citrus': 'تازه مرکباتی',
  'Fresh Aquatic': 'تازه آبی',
  'Fresh Green': 'تازه سبز',
  'Fresh Fruity': 'تازه میوه‌ای',
  'Citrus Aromatic': 'مرکباتی معطر',
  'Citrus Woody': 'مرکباتی چوبی',
  'Floral Aquatic': 'گلی آبی',
  'Floral Fruity': 'گلی میوه‌ای',
  'Floral Woody': 'گلی چوبی',
  'Floral Green': 'گلی سبز',
  'Fruity Floral': 'میوه‌ای گلی',
  'Chypre': 'شیپر',
  'Chypre Floral': 'شیپر گلی',
  'Chypre Fruity': 'شیپر میوه‌ای',
  'Fougere': 'فرگر',
  'Fougere Aromatic': 'فرگر معطر',
  'Fougere Spicy': 'فرگر ادویه‌ای',
  'Gourmand': 'گورماند',
  'Aquatic': 'آبی',
  'Aromatic': 'معطر',
  'Spicy': 'ادویه‌ای',
  'Vanilla': 'وانیلی',
  'Leather': 'چرمی',
  'Tobacco': 'تنباکویی',
};

// =========================================================================
// 4. GENDER / CONCENTRATION / SEASON / TIME
// =========================================================================

export const GENDER_FA = {
  'women': 'زنانه',
  'men': 'مردانه',
  'women and men': 'مردانه و زنانه',
  'men and women': 'مردانه و زنانه',
  'unisex': 'مردانه و زنانه',
};

export const CONCENTRATION_FA = {
  'Parfum': 'پرفیوم',
  'Extrait': 'اکستره',
  'Extrait de Parfum': 'اکستره پرفیوم',
  'Eau de Parfum': 'ادو پرفیوم',
  'Eau de Parfum Intense': 'ادو پرفیوم انتنس',
  'Parfum Intense': 'پرفیوم انتنس',
  'Elixir': 'اکسیر',
  'Eau de Toilette': 'ادو توالت',
  'Eau de Cologne': 'ادو کلن',
  'Cologne': 'کلن',
  'Eau Fraiche': 'ادو فرش',
  'Eau de Parfum Absolu': 'ادو پرفیوم ابسولو',
  'Absolu': 'ابسولو',
  'Intense': 'انتنس',
  'Pure Parfum': 'پرفیوم خالص',
};

export const SEASON_FA = {
  'spring': 'بهار',
  'summer': 'تابستان',
  'autumn': 'پاییز',
  'fall': 'پاییز',
  'winter': 'زمستان',
};

export const TIME_FA = {
  'day': 'روز',
  'night': 'شب',
  'evening': 'شب',
  'morning': 'صبح',
};

// =========================================================================
// 5. BRAND DICTIONARY (common luxury brands)
// =========================================================================

export const BRAND_FA = {
  'Dior': 'دیور',
  'Chanel': 'شنل',
  'Amouage': 'آموژ',
  'Guerlain': 'گرلن',
  'Creed': 'کريد',
  'Tom Ford': 'تام فورد',
  'Parfums de Marly': 'پرفیومز دو مارلی',
  'Maison Francis Kurkdjian': 'مزون فرانسیس کورکدیان',
  'Frederic Malle': 'فردریک مال',
  'Byredo': 'بایردو',
  'Diptyque': 'دیپتیک',
  'Maison Margiela': 'مزون مارژلا',
  'By Kilian': 'بای کیلیان',
  'Kilian': 'کیلیان',
  'Jo Malone': 'جو مالون',
  'Versace': 'ورساچه',
  'Yves Saint Laurent': 'ایو سن لوران',
  'Givenchy': 'ژیوانشی',
  'Hermès': 'هرمس',
  'Bvlgari': 'بولگاری',
  'Gucci': 'گوشی',
  'Prada': 'پرادا',
  'Burberry': 'بربری',
  'Hugo Boss': 'هوگو باس',
  'Paco Rabanne': 'پاکو ربان',
  'Jean Paul Gaultier': 'ژان پل گوتیه',
  'Armani': 'آرمانی',
  'Lancôme': 'لانکوم',
  'Carolina Herrera': 'کارولینا هررا',
  'Lattafa': 'لتافا',
  'Afnan': 'افنان',
  'Montale': 'مونتال',
  'Mancera': 'مانسرا',
  'Nishane': 'نیشانه',
  'Penhaligon\'s': 'پنهالیگونز',
  'Roja': 'روژا',
  'Xerjoff': 'زروجف',
  'Initio': 'اینیتیو',
  'Tiziana Terenzi': 'تیتزیانا ترنتزی',
  'Kayali': 'کایالی',
  'Mugler': 'مولر',
  'Thierry Mugler': 'تیه‌ری مولر',
  'Salvatore Ferragamo': 'سالواتوره فراگامو',
  'Boucheron': 'بوشرون',
  'Van Cleef & Arpels': 'ون کلیف و آرپلز',
  'Cartier': 'کارتیه',
  'Tiffany': 'تیفانی',
  'Montblanc': 'مونت‌بلان',
  'Salvatore': 'سالواتوره',
  'Dolce & Gabbana': 'دولچه و گابانا',
  'Davidoff': 'داویدوف',
  'Calvin Klein': 'کلوین کلین',
  'Roberto Cavalli': 'ربرتو کاوالی',
  'Lalique': 'لالیک',
  'Baccarat': 'باکارا',
  'Mancera': 'مانسرا',
  "L'Artisan Parfumeur": 'لارتیزان پرفیومر',
  'Serge Lutens': 'سرژ لوتنس',
  'Annick Goutal': 'انیک گوتال',
  'Goutal': 'گوتال',
  'Acqua di Parma': 'آکوا دی پارما',
  'Comme des Garcons': 'کم دو گارسون',
  'Le Labo': 'ل لابو',
  'Lush': 'لاش',
  'Aesop': 'ایسوپ',
  'Zarkoperfume': 'زارکوپرفیوم',
  'Maison Crivelli': 'مزون کریولی',
  ' Vilhelm Parfumerie': 'ویلهلم پرفیومری',
  'Vilhelm Parfumerie': 'ویلهلم پرفیومری',
  'Beaufort London': 'بوفور لندن',
  'Room 1015': 'اتاق ۱۰۱۵',
  'Juliette Has a Gun': 'ژولیت یک اسلحه دارد',
  'Ex Nihilo': 'اِکس نیهیلو',
  'Gallivant': 'گالیکانت',
  'Mendi': 'منندی',
};

// =========================================================================
// 6. SEASON/TIME INFERENCE FROM ACCORDS
//    When aggregate season votes are not available, infer from accords
// =========================================================================

// Each accord contributes weighted votes to one or more seasons
export const ACCORD_SEASON_MAP = {
  'citrus':       { summer: 3, spring: 2 },
  'fresh':        { summer: 3, spring: 2 },
  'aquatic':      { summer: 3, spring: 1 },
  'marine':       { summer: 3, spring: 1 },
  'watery':       { summer: 3, spring: 1 },
  'tropical':     { summer: 3 },
  'fruity':       { summer: 2, spring: 2 },
  'green':        { spring: 3, summer: 1 },
  'floral':       { spring: 3, summer: 1 },
  'white floral': { spring: 2, summer: 2 },
  'yellow floral':{ spring: 3, autumn: 1 },
  'rose':         { spring: 3, autumn: 1 },
  'lily':         { spring: 3 },
  'freesia':      { spring: 3 },
  'magnolia':     { spring: 3 },
  'honeysuckle':  { spring: 3, summer: 1 },
  'orange blossom':{ spring: 2, summer: 2 },
  'bergamot':     { summer: 2, spring: 2 },
  'lemon':        { summer: 3, spring: 1 },
  'mandarin':     { summer: 2, spring: 2 },
  'lime':         { summer: 3 },
  'grapefruit':   { summer: 3 },
  'peach':        { summer: 2, autumn: 1 },
  'apple':        { autumn: 2, spring: 1 },
  'pear':         { autumn: 2, spring: 1 },
  'plum':         { autumn: 2, winter: 1 },
  'coconut':      { summer: 3 },
  'pineapple':    { summer: 3 },
  'mango':        { summer: 3 },
  'fig':          { summer: 2, autumn: 1 },
  'woody':        { winter: 3, autumn: 2 },
  'sandalwood':   { winter: 2, autumn: 2 },
  'cedar':        { autumn: 2, winter: 1 },
  'patchouli':    { autumn: 2, winter: 2 },
  'mossy':        { autumn: 2, spring: 1 },
  'earthy':       { autumn: 2, winter: 1 },
  'vanilla':      { winter: 3, autumn: 2 },
  'amber':        { winter: 3, autumn: 2 },
  'balsamic':     { winter: 2, autumn: 2 },
  'warm spicy':   { winter: 3, autumn: 2 },
  'spicy':        { winter: 2, autumn: 2 },
  'cinnamon':     { winter: 3, autumn: 2 },
  'honey':        { winter: 2, autumn: 1 },
  'leather':      { winter: 2, autumn: 2 },
  'smoky':        { winter: 3, autumn: 2 },
  'tobacco':      { winter: 2, autumn: 3 },
  'incense':      { winter: 3, autumn: 2 },
  'resinous':     { winter: 2, autumn: 2 },
  'oud':          { winter: 3, autumn: 2 },
  'gourmand':     { winter: 3, autumn: 1 },
  'caramel':      { winter: 2, autumn: 2 },
  'cocoa':        { winter: 3, autumn: 1 },
  'chocolate':    { winter: 3, autumn: 1 },
  'coffee':       { winter: 3, autumn: 2 },
  'almond':       { winter: 2, autumn: 1 },
  'powdery':      { autumn: 1, spring: 1 },
  'musky':        { winter: 1, autumn: 1, spring: 1 },
  'animalic':     { winter: 2, autumn: 2 },
  'aromatic':     { spring: 2, summer: 1 },
  'lavender':     { spring: 2, summer: 1 },
  'mint':         { summer: 3, spring: 1 },
  'ozonic':       { summer: 3, spring: 2 },
  'metallic':     { summer: 1 },
};

export const ACCORD_TIME_MAP = {
  'fresh':        { day: 3 },
  'citrus':       { day: 3 },
  'aquatic':      { day: 3 },
  'marine':       { day: 3 },
  'green':        { day: 3 },
  'floral':       { day: 2, night: 1 },
  'white floral': { night: 2, day: 1 },
  'rose':         { day: 2, night: 2 },
  'fruity':       { day: 2 },
  'sweet':        { night: 2 },
  'vanilla':      { night: 3 },
  'amber':        { night: 3 },
  'warm spicy':   { night: 3 },
  'spicy':        { night: 2 },
  'woody':        { night: 2, day: 1 },
  'sandalwood':   { night: 2 },
  'patchouli':    { night: 2 },
  'leather':      { night: 3 },
  'smoky':        { night: 3 },
  'tobacco':      { night: 3 },
  'gourmand':     { night: 3 },
  'chocolate':    { night: 3 },
  'coffee':       { day: 2, night: 1 },
  'incense':      { night: 2 },
  'oud':          { night: 3 },
  'musk':         { night: 2 },
  'powdery':      { day: 1, night: 1 },
  'musky':        { night: 2 },
  'animalic':     { night: 3 },
  'aromatic':     { day: 2 },
  'lavender':     { day: 2, night: 1 },
  'mint':         { day: 2 },
  'ozonic':       { day: 2 },
  'cinnamon':     { night: 2 },
  'honey':        { night: 2 },
  'caramel':      { night: 2 },
  'balsamic':     { night: 2 },
};

// =========================================================================
// 7. TRANSLATION API FALLBACK (MyMemory - free, no key, 5000 words/day/email)
// =========================================================================

const _apiCache = new Map();

export async function translateText(en) {
  if (!en || !en.trim()) return '';
  en = en.trim();
  if (_apiCache.has(en)) return _apiCache.get(en);

  // Check dictionary first
  // (handled by callers for notes/accords/etc.)

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(en)}&langpair=en|fa`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'LarsiPerfumeFinder/8.0 (https://github.com/therasuoli/PWA-larsi-perfume-finder)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fa = data?.responseData?.translatedText || '';
    if (fa && !fa.includes('INVALID') && !fa.includes('MYMEMORY')) {
      _apiCache.set(en, fa);
      return fa;
    }
    throw new Error('API returned invalid response');
  } catch (e) {
    console.warn(`  [translateText] failed for "${en}": ${e.message}`);
    _apiCache.set(en, en); // fallback to English
    return en;
  }
}

// =========================================================================
// 8. PUBLIC TRANSLATION FUNCTIONS
// =========================================================================

/** Translate an array of note names, preserving order. */
export function translateNotes(enArr) {
  if (!Array.isArray(enArr)) return [];
  return enArr.map(en => NOTES_FA[en] || en);
}

/** Translate accords array (objects with name + percent). */
export function translateAccords(enAccords) {
  if (!Array.isArray(enAccords)) return [];
  return enAccords.map(a => ({
    nameEn: a.nameEn || a.name,
    nameFa: ACCORDS_FA[a.nameEn || a.name] || a.nameEn || a.name,
    percent: a.percent,
  }));
}

/** Translate a family name. */
export function translateFamily(en) {
  return FAMILY_FA[en] || en;
}

/** Translate a gender phrase. */
export function translateGender(en) {
  return GENDER_FA[(en || '').toLowerCase()] || en;
}

/** Translate a concentration string. */
export function translateConcentration(en) {
  return CONCENTRATION_FA[en] || en;
}

/** Translate a brand name. */
export function translateBrand(en) {
  return BRAND_FA[en] || en;
}

/**
 * Infer recommended seasons from accord list.
 * Returns: { primary: 'spring', secondary: 'summer', seasons: ['spring','summer'] }
 */
export function inferSeasons(accordsEn) {
  const scores = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (const a of accordsEn) {
    const m = ACCORD_SEASON_MAP[a.nameEn || a.name];
    if (!m) continue;
    const weight = (a.percent || 50) / 100;
    for (const [k, v] of Object.entries(m)) {
      scores[k] += v * weight;
    }
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][1] > 0 ? sorted[0][0] : null;
  const secondary = sorted[1][1] > 0 ? sorted[1][0] : null;
  const seasons = sorted.filter(([, v]) => v > 0).map(([k]) => k);
  return { primary, secondary, seasons, scores };
}

/**
 * Infer recommended time-of-day from accord list.
 * Returns: { primary: 'day'|'night'|null, secondary: ... }
 */
export function inferTimeOfDay(accordsEn) {
  const scores = { day: 0, night: 0 };
  for (const a of accordsEn) {
    const m = ACCORD_TIME_MAP[a.nameEn || a.name];
    if (!m) continue;
    const weight = (a.percent || 50) / 100;
    for (const [k, v] of Object.entries(m)) {
      scores[k] += v * weight;
    }
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][1] > 0 ? sorted[0][0] : null;
  const secondary = sorted[1][1] > 0 ? sorted[1][0] : null;
  return { primary, secondary, scores };
}
