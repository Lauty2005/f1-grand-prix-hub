// Diccionario de banderas

export const COUNTRY_NAMES = {
    'ABU': 'Abu Dhabi',
    'ARG': 'Argentina',
    'ATN': 'Austria', // Usé tu código ATN
    'AUS': 'Australia',
    'AZB': 'Azerbaiyán', // Usé tu código AZB
    'BEL': 'Bélgica',
    'BHR': 'Bahréin',
    'BRZ': 'Brasil', // Usé tu código BRZ
    'CAN': 'Canadá',
    'CHN': 'China',
    'ESP': 'España',
    'FRA': 'Francia',
    'GBR': 'Gran Bretaña',
    'GER': 'Alemania',
    'HUN': 'Hungría',
    'ITA': 'Italia',
    'JPN': 'Japón',
    'MEX': 'México',
    'MON': 'Mónaco',
    'NED': 'Países Bajos',
    'NZE': 'Nueva Zelanda', // Usé tu código NZE
    'QAT': 'Qatar',
    'SAU': 'Arabia Saudita',
    'SIN': 'Singapur',
    'TAI': 'Tailandia', // Usé tu código TAI
    'USA': 'Estados Unidos'
};

const countryCodes = { 
    'NED': 'nl', 'MEX': 'mx', 'MON': 'mc', 'GBR': 'gb', 'ESP': 'es', 
    'AUS': 'au', 'JPN': 'jp', 'BHR': 'bh', 'SAU': 'sa', 'CHN': 'cn',
    'USA': 'us', 'ITA': 'it', 'ABU': 'ae', 'CAN': 'ca', 'ATN': 'at',
    'BEL': 'be', 'HUN': 'hu', 'AZB': 'az', 'SIN': 'sg', 'BRZ': 'br',
    'QAT': 'qa', 'TAI': 'th', 'NZE': 'nz', 'FRA': 'fr', 'GER': 'de',
    'ARG': 'ar'
};

export function getFlagEmoji(code) {
    const cc = countryCodes[code];
    return cc ? `<img src="https://flagcdn.com/w40/${cc}.png" class="flag-icon" style="width:25px; display:inline-block;">` : '';
}

export function getPositionBadge(r, color) {
    if (r.dsq) return '<span style="background:black; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid white; font-size:0.9rem;">DQ</span>';
    if (r.dns) return '<span style="background:#333; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #666; font-size:0.9rem;">DNS</span>';
    if (r.dnq) return '<span style="background:#333; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #666; font-size:0.9rem;">DNQ</span>';
    if (r.dnf) return '<span style="background:rgba(255,0,0,0.2); color:#ff4444; padding:4px 8px; border-radius:4px; font-weight:bold; border:1px solid #ff4444; font-size:0.9rem;">NC</span>';

    return `<span style="
        background: ${r.position == 1 ? '#FFD700' : r.position == 2 ? '#C0C0C0' : (r.position == 3 ? '#CD7F32' : 'rgba(255,255,255,0.1)')}; 
        color: ${r.position <= 3 ? 'black' : 'white'}; 
        padding: 4px 12px; 
        border-radius: 4px; 
        font-weight: bold;
        border: ${r.position > 3 ? `1px solid ${color}` : 'none'};
    ">P${r.position}</span>`;
}