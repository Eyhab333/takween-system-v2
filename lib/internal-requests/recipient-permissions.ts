import { RECIPIENTS, type RequestRecipientKey } from "./recipients";

const ALL_KEYS = RECIPIENTS.map((r) => r.key) as RequestRecipientKey[];

/** =========================
 *  مجموعات القيادات / الطواقم
 *  ========================= */

const SCHOOL_HEADS: RequestRecipientKey[] = [
  "mnar_girls_ceo",
  "rawda1_ceo",
  "rawda2_ceo",
  "rawda3_ceo",
  "rawda4_ceo",
];

const SUPERVISION_SPECIALISTS: RequestRecipientKey[] = [
  "alshaya_supervisor",
  "altariqii_supervisor",
  "sayed_supervisor",
];

/** =========================
 *  طاقم المدارس والروضات
 *  ========================= */

const MNAR_BOYS_STAFF: RequestRecipientKey[] = [
"mnar_boys_r_almutawa",  
"mnar_boys_ralfaiz",     
"mnar_boys_a_almotwa",   
"mnar_boys_m_alateeq",   
"mnar_boys_q_alfrhud",   
"mnar_boys_f_alqashami", 
"mnar_boys_a_d_alawad",  
"mnar_boys_a_brakat",    
"mnar_boys_mahmood",     
"mnar_boys_abdallaty",   
"mnar_boys_hameed-s",    
"mnar_boys_m_ali",       
"mnar_boys_a_aljidawii", 
"mnar_boys_a_attab",     
"mnar_boys_m_bayoumi",   
"mnar_boys_aa_alamer",   
"mnar_boys_a_alddahash", 
"mnar_boys_t_altawala",  
"mnar_boys_k_alfanisan", 
"mnar_boys_sa_alhamad",  
"mnar_boys_t_alhazzany", 
"mnar_boys_f_alnafa",    
"mnar_boys_am_alnutifi", 
"mnar_boys_f_alfahad",   
"mnar_boys_as_almulhim",    
"mnar_boys_a_alsamhan",     
"mnar_boys_k_s_alhamad",    
"mnar_boys_a_h_almasoud",   
"mnar_boys_a_h_aljaser",    
"mnar_boys_a-ahmad",        
"mnar_boys_k-m-ahmd",       
"mnar_boys_a-mahmood",      
"mnar_boys_k_alsadle",      
"mnar_boys_a_alzunidi",     
"mnar_boys_o_a_n_adryweesh",
"mnar_boys_ma_albader",     
];

const MNAR_GIRLS_STAFF: RequestRecipientKey[] = [
  //  طاقم منار بنات 
  "mnar_girls_f_alobawe",     
"mnar_girls_h_anaz",        
"mnar_girls_n_y_almasoud",      
"mnar_girls_aa_almansor",   
"mnar_girls_r_almuhatrsh",   
"mnar_girls_aa_alnutifi",   
"mnar_girls_afnanf",        
"mnar_girls_a_a_alsuwaykit",
"mnar_girls_jawaherf",      
"mnar_girls_h_alsuwiket",   
"mnar_girls_ma_almulifi",   
"mnar_girls_d_alshammri",   
"mnar_girls_a_alfarhod",    
"mnar_girls_l_alwazzan",    
"mnar_girls_m_alosaimi",    
"mnar_girls_m_alfarhud",    
"mnar_girls_h_albhlal",     
"mnar_girls_nedarf",        
"mnar_girls_amenam",        
"mnar_girls_e_alturaiqi",   
"mnar_girls_l_almunifi",    
"mnar_girls_r_altwala",     
"mnar_girls_mm_alfarhod",   
"mnar_girls_l_alfrih",      
"mnar_girls_sarah",         
"mnar_girls_s-s-mnsor",     
"mnar_girls_na_alshaya",    
"mnar_girls_r_abdallah",    
"mnar_girls_h_abdallah",    
"mnar_girls_m-m-alduwaysh", 
"mnar_girls_d_m_s_athunian",
];

const RAWDA1_STAFF: RequestRecipientKey[] = [
  //  طاقم الروضة الأولى 
  "rawda1_s_alhumaidan", 
"rawda1_ms_alswiket",  
"rawda1_a_alfarag",    
"rawda1_s_alnadawi",   
"rawda1_s_s_alaues",   
"rawda1_a_alzuwaid",   
"rawda1_af_alkhunaini",
"rawda1_h_alarajh",    
"rawda1_t_alghanim",   
"rawda1_ma_alfarhod",  
"rawda1_na_alosami",   
"rawda1_r_alnutifi",   
"rawda1_no_alosaimi",  
"rawda1_m_aljabr",     
"rawda1_a_alyahya",    
"rawda1_h_aldalbaji",  
"rawda1_l_s_asalem",   
];

const RAWDA2_STAFF: RequestRecipientKey[] = [
  //  طاقم الروضة الثانية 
  "rawda2_s_alturiqe",    
"rawda2_h_aljower",     
"rawda2_s_alosaimi",    
"rawda2_la_alsuwiket",  
"rawda2_a_almutairi",   
"rawda2_h_almasood",    
"rawda2_r_alrasheed",   
"rawda2_m_alrased",     
"rawda2_l_alatalla",    
"rawda2_n_a_alhammadi", 
"rawda2_r_alawwad",     
"rawda2_la_alturaiqi",  
"rawda2_r_alromi",      
"rawda2_alanoodf",      
"rawda2_h_almadallah",  
"rawda2_r_albatel",     
"rawda2_n_almunifi",    
"rawda2_m_a_almansor",  
"rawda2_f_h_almetery",  
];

const RAWDA3_STAFF: RequestRecipientKey[] = [
  //  طاقم الروضة الثالثة 
  "rawda3_s_alslman",    
"rawda3_n_alshammri",  
"rawda3_f_alzuwaid",   
"rawda3_s_alobawe",    
"rawda3_sh_shuhidhi",  
"rawda3_b_alarajh",    
"rawda3_n_alsaeayb",   
"rawda3_nm_alkhunaini",
"rawda3_ss_alfaleh",   
"rawda3_h_alknini",    
"rawda3_r_aljower",    
"rawda3_r_alfayez",    
"rawda3_b_almahasin",  
"rawda3_a_aljabr",     
"rawda3_r_f_alosaimi", 
"rawda3_l_g_aljaser",  
"rawda3_r_a_alshamry", 

];

const RAWDA4_STAFF: RequestRecipientKey[] = [
  //  طاقم الروضة الرابعة 
  "rawda4_h_alshaya",    
"rawda4_m_alfaraj",    
"rawda4_mm_almousa",   
"rawda4_L_altayar",    
"rawda4_n_almaimouni", 
"rawda4_ghzwa",        
"rawda4_n_almosa",     
"rawda4_g_alfahid",    
"rawda4_an_alslman",   
"rawda4_a_alttayar",   
"rawda4_s_bader",      
"rawda4_n_alkhunini",  
"rawda4_sh_aldhuwaikh",
"rawda4_l_a_alqashamy",
];

/** =========================
 *  صلاحيات أساسية ثابتة
 *  ========================= */

const basePermissions: Partial<Record<RequestRecipientKey, RequestRecipientKey[]>> = {
  // رئيس المجلس يرى الجميع إلا نفسه
  chairman: ALL_KEYS.filter((k) => k !== "chairman"),

  // المدير التنفيذي يرى الجميع إلا نفسه
  ceo: ALL_KEYS.filter((k) => k !== "ceo"),

  finance: ["ceo"],
  hr: ["ceo"],
  platforms: ["ceo"],
  collector: ["ceo"],
  secretary: ["ceo"],

  projects: ["ceo", "maintenance"],
  maintenance: ["projects"],

  media_manager: ["ceo", "designer", "media_programs"],
  designer: ["media_manager"],
  media_programs: ["media_manager"],

  supervision_head: [
    "ceo",
    "mnar_boys_ceo",
    ...SUPERVISION_SPECIALISTS,
  ],

  mnar_boys_ceo: [
    "supervision_head",
    ...MNAR_BOYS_STAFF,
  ],

  executive_assistant: ["ceo", ...SCHOOL_HEADS],
  admin_supervisor: ["ceo", ...SCHOOL_HEADS],
  edu_supervisor: ["ceo", ...SCHOOL_HEADS],

  mnar_girls_ceo: [
    "executive_assistant",
    "admin_supervisor",
    "edu_supervisor",
    ...MNAR_GIRLS_STAFF,
  ],

  rawda1_ceo: [
    "executive_assistant",
    "admin_supervisor",
    "edu_supervisor",
    ...RAWDA1_STAFF,
  ],

  rawda2_ceo: [
    "executive_assistant",
    "admin_supervisor",
    "edu_supervisor",
    ...RAWDA2_STAFF,
  ],

  rawda3_ceo: [
    "executive_assistant",
    "admin_supervisor",
    "edu_supervisor",
    ...RAWDA3_STAFF,
  ],

  rawda4_ceo: [
    "executive_assistant",
    "admin_supervisor",
    "edu_supervisor",
    ...RAWDA4_STAFF,
  ],

  athar_center: ["ceo"],

  binaa_center_boys: ["ceo", "binaa_center_girls"],
  binaa_center_girls: ["binaa_center_boys"],
};

/** =========================
 *  توليد صلاحيات الأفراد تلقائيًا
 *  ========================= */

const generatedPermissions: Partial<
  Record<RequestRecipientKey, RequestRecipientKey[]>
> = {};

for (const key of SUPERVISION_SPECIALISTS) {
  generatedPermissions[key] = ["supervision_head"];
}

for (const key of MNAR_BOYS_STAFF) {
  generatedPermissions[key] = ["mnar_boys_ceo"];
}

for (const key of MNAR_GIRLS_STAFF) {
  generatedPermissions[key] = ["mnar_girls_ceo"];
}

for (const key of RAWDA1_STAFF) {
  generatedPermissions[key] = ["rawda1_ceo"];
}

for (const key of RAWDA2_STAFF) {
  generatedPermissions[key] = ["rawda2_ceo"];
}

for (const key of RAWDA3_STAFF) {
  generatedPermissions[key] = ["rawda3_ceo"];
}

for (const key of RAWDA4_STAFF) {
  generatedPermissions[key] = ["rawda4_ceo"];
}

/** =========================
 *  الكائن النهائي
 *  ========================= */

const PERMISSIONS = {
  ...basePermissions,
  ...generatedPermissions,
} as Record<RequestRecipientKey, RequestRecipientKey[]>;

export function getAllowedRecipientKeys(
  senderKey: RequestRecipientKey | null | undefined
): RequestRecipientKey[] {
  // موظف عادي ليس له requestRecipientKey
  // نمنع عنه رئيس المجلس فقط
  if (!senderKey) {
    return ALL_KEYS.filter((k) => k !== "chairman");
  }

  return PERMISSIONS[senderKey] ?? [];
}

export function canSendTo(
  senderKey: RequestRecipientKey | null | undefined,
  targetKey: RequestRecipientKey | null | undefined
) {
  if (!targetKey) return false;
  return getAllowedRecipientKeys(senderKey).includes(targetKey);
}

export function getVisibleRecipientsForSender(
  senderKey: RequestRecipientKey | null | undefined,
  exclude: Array<RequestRecipientKey | string | null | undefined> = []
) {
  const allowed = new Set(getAllowedRecipientKeys(senderKey));
  const excluded = new Set(exclude.filter(Boolean));

  return RECIPIENTS.filter(
    (r) => allowed.has(r.key) && !excluded.has(r.key)
  );
}