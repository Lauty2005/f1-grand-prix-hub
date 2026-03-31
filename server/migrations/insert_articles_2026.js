import { pool } from '../src/config/db.js';

const articles = [
    {
        title: 'El Fracaso del "Super Clipping" y los Fallos Aerodinámicos: La Crisis Técnica de la F1 2026',
        slug: 'crisis-tecnica-super-clipping-f1-2026',
        excerpt: 'La revolución térmica y eléctrica de la F1 desató un ecosistema impredecible. Velocidades que colapsan en plena recta, accidentes inevitables y alerones que no soportan la presión exponen las fisuras del nuevo reglamento.',
        content: `<p>La temporada 2026 prometía ser el inicio de una era dorada para la Fórmula 1. Con un reglamento diseñado para equilibrar la potencia del motor de combustión y la energía eléctrica a un 50/50 y una aerodinámica activa revolucionaria, la FIA buscaba coches más eficientes y relevantes para la industria.</p><p>Sin embargo, tras las primeras tres rondas en Australia, China y Japón, el paddock se encuentra sumido en una crisis operativa. Al eliminar el complejo sistema MGU-H que recuperaba energía de los escapes, la responsabilidad eléctrica recayó sobre el MGU-K. Ahora, los coches exigen el triple de electricidad que antes, creando una <strong>escasez crónica de energía</strong>.</p><h2>⚠️ El peligro inminente del "Super Clipping"</h2><p>Para solucionar la falta de batería sin perder velocidad por resistencia aerodinámica, los ingenieros crearon un truco algorítmico llamado <strong>Super Clipping</strong>.</p><p>En plena recta o en curvas de alta velocidad, el piloto pisa el acelerador a fondo. Esto engaña al coche para que los alerones activos se mantengan planos (Modo Recta) y no generen fricción. Pero, internamente, el ordenador corta drásticamente la potencia del motor de combustión, usándolo solo para recargar la batería.</p><p><strong>El resultado es aterrador.</strong> Durante los test de pretemporada en Bahréin, el uso del Super Clipping en la rápida Curva 12 provocó que las velocidades cayeran de forma repentina de 267 km/h a 233 km/h en plena zona de aceleración. Esta caída de 30 km/h genera diferencias de velocidad extremas entre monoplazas.</p><p>El peligro dejó de ser teórico en Japón, cuando Oliver Bearman (Haas) impactó violentamente a 300 km/h contra Franco Colapinto (Alpine), quien había entrado en un estado automático de Super Clipping sin que sus luces de freno lo advirtieran. Ahora, escuderías como McLaren presionan a la FIA para que eleve el límite de recarga de este sistema de 250 kW a 350 kW, buscando que la deceleración sea menos prolongada y más predecible.</p><h2>🔧 La física derrota al software: El fallo de Mercedes</h2><p>A los problemas eléctricos se suman los fallos físicos de la "Aerodinámica Activa". En China, el Mercedes de Kimi Antonelli encendió las alarmas cuando su alerón delantero tardó cerca de 800 milisegundos en cerrarse bajo frenada, el doble de los 400 milisegundos permitidos por la FIA.</p><p>Aunque los rivales sospechaban de un truco ilegal, la realidad era más preocupante: Mercedes había subestimado la brutal fuerza del aire a más de 300 km/h. La presión aerodinámica era tan fuerte que los actuadores hidráulicos del alerón simplemente no tenían la fuerza suficiente para mover la pieza hasta que el coche reducía la velocidad drásticamente. Esto demostró que, a veces, las brutales leyes de la física de fluidos superan a las simulaciones de software más avanzadas de la Fórmula 1.</p>`,
        author: 'Redacción F1 Hub',
        category: 'tecnica',
        tags: ['F1 2026', 'Super Clipping', 'Aerodinámica Activa', 'Mercedes', 'Reglamento', 'Colapinto', 'Bearman'],
        published: true,
        featured: true,
    },
    {
        title: 'Leyendas vs. Algoritmos: La Furia de Verstappen y Hamilton ante el Fenómeno Antonelli',
        slug: 'verstappen-hamilton-vs-antonelli-f1-2026',
        excerpt: 'El cisma técnico de 2026 no solo divide a los equipos, sino que está reescribiendo los requisitos neurológicos para ser un campeón del mundo. Mientras los veteranos sufren, un novato de 19 años reescribe la historia.',
        content: `<p>El debate central hoy en la Fórmula 1 es si el deporte está perdiendo el factor humano. El "piloto puro", que se basaba en el instinto, la memoria muscular y el manejo del coche al borde del límite de adherencia, se enfrenta a máquinas que recompensan exclusivamente la gestión estratégica del software.</p><h2>🗣️ El calvario de los campeones del mundo</h2><p>Los veteranos más laureados no han ocultado su frustración ante lo que consideran la degradación del deporte hacia una fórmula artificial:</p><ul><li><strong>Max Verstappen:</strong> El tetracampeón detesta que el talento en la frenada sea saboteado por un software. No ha dudado en tildar las carreras de 2026 como <em>"una broma"</em> y a los coches como auténticos <em>"Frankenstein"</em>.</li><li><strong>Lewis Hamilton:</strong> En su debut con Ferrari, el británico se ha mostrado exasperado. Llegó a quejarse de que en medio de los agresivos cortes de potencia dictados por el motor, su monoplaza se sentía <em>"más lento que un coche de GP2"</em>.</li><li><strong>Charles Leclerc:</strong> El maestro de la clasificación vivió una pesadilla surrealista en Suzuka. El monegasco estalló por radio al notar que, cuanto más riesgo tomaba y más al límite conducía en las curvas, sus tiempos de vuelta empeoraban. Al atacar más duro, el ordenador entraba en pánico por el gasto energético e intervenía drásticamente para compensarlo en las rectas, castigando su osadía.</li></ul><h2>🏆 Kimi Antonelli y la ventaja de no tener memoria</h2><p>En las antípodas de este descontento brilla Kimi Antonelli. El prodigio italiano de 19 años, reemplazo de Hamilton en Mercedes, encadenó dos victorias consecutivas en China y Japón, convirtiéndose en el líder del campeonato mundial más joven de la historia de la F1.</p><p>¿Su secreto? <strong>Carece de la memoria muscular de la era híbrida anterior.</strong> Mientras leyendas como Verstappen y Hamilton luchan instintivamente contra las intervenciones del Super Clipping, Antonelli asume este comportamiento errático como algo natural. El joven italiano adapta sus inputs al milímetro con el ritmo del ordenador, demostrando que esta nueva era exige un cerebro de analista de sistemas.</p>`,
        author: 'Redacción F1 Hub',
        category: 'analisis',
        tags: ['F1 2026', 'Antonelli', 'Verstappen', 'Hamilton', 'Leclerc', 'Mercedes', 'Ferrari', 'Super Clipping'],
        published: true,
        featured: true,
    },
    {
        title: 'Vacíos Legales y la Cumbre de Miami: El Plan de Rescate de la FIA para 2026',
        slug: 'vacios-legales-cumbre-miami-fia-rescate-2026',
        excerpt: 'Un vacío legal masivo en los motores, un parche de emergencia en Suzuka y la cancelación geopolítica de dos Grandes Premios obligan a la FIA a reestructurar la temporada antes de aterrizar en Estados Unidos.',
        content: `<p>El destino le ha dado a la Fórmula 1 un respiro involuntario. La escalada del conflicto bélico en Medio Oriente, con la cercanía de bases militares a los circuitos, forzó a Stefano Domenicali a cancelar de manera inminente los Grandes Premios de Bahréin y Arabia Saudita. Lejos de reemplazar las citas, este vacío logístico ha creado un parón de 33 días en el calendario, un tiempo que la FIA y la Comisión de la F1 usarán desesperadamente para salvar el reglamento antes de la carrera en Miami.</p><h2>🔧 El truco de los 130°C: El vacío legal de Mercedes</h2><p>Antes de pensar en Miami, la FIA tuvo que apagar un incendio político originado por Mercedes y Red Bull-Ford. Los rivales descubrieron que estas dos marcas explotaron un enorme vacío legal respecto a la "relación de compresión" de los motores V6, limitada por reglamento a 16:1.</p><p>Al pasar las inspecciones estáticas de la FIA a temperatura ambiente ("en frío"), los motores cumplían la norma. Sin embargo, al salir a pista y alcanzar los 130°C, el calor expandía los metales deliberadamente, elevando la relación de compresión a 18:1 y otorgando una <strong>ventaja de potencia brutal en las rectas</strong>. Ante la amenaza de protesta de Ferrari y Audi, la FIA dictaminó que a partir del 1 de junio de 2026, todas las mediciones de compresión se harán en caliente a 130°C, neutralizando la trampa.</p><h2>⚡ Los ajustes de energía y la agenda de Miami</h2><p>La FIA ya demostró que no dudará en intervenir de emergencia. En la sesión de clasificación de Japón, redujeron la cantidad de energía máxima que se puede recargar por vuelta de 9.0 a 8.0 Megajulios. Al exigir menos recarga, liberaron a los pilotos de tener que levantar el pie o gestionar agresivamente la batería, permitiéndoles enfocarse un poco más en la pura velocidad.</p><p>Ahora, la cumbre de la Comisión de F1 previa al GP de Miami tiene una agenda crítica. No solo debatirán límites estrictos a la entrega de la energía eléctrica para mitigar el peligrosísimo Super Clipping, sino que también se espera que introduzcan el nuevo <em>Driving Cooling System</em> (Sistema de Refrigeración del Piloto, DCS). Esta medida, apoyada por la asociación de pilotos, aumentará el peso mínimo de los coches para integrar sistemas térmicos que alivien las inhumanas temperaturas de los monoplazas 2026.</p>`,
        author: 'Redacción F1 Hub',
        category: 'noticias',
        tags: ['F1 2026', 'FIA', 'Reglamento', 'Mercedes', 'Red Bull', 'GP Miami', 'Motores V6', 'Super Clipping', 'Bahréin', 'Arabia Saudita'],
        published: true,
        featured: false,
    },
];

const client = await pool.connect();
try {
    await client.query('BEGIN');
    for (const art of articles) {
        await client.query(`
            INSERT INTO articles (title, slug, excerpt, content, author, category, tags, published, featured, cover_image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, null)
            ON CONFLICT (slug) DO UPDATE SET
                title     = EXCLUDED.title,
                excerpt   = EXCLUDED.excerpt,
                content   = EXCLUDED.content,
                author    = EXCLUDED.author,
                category  = EXCLUDED.category,
                tags      = EXCLUDED.tags,
                published = EXCLUDED.published,
                featured  = EXCLUDED.featured,
                updated_at = NOW()
        `, [art.title, art.slug, art.excerpt, art.content, art.author, art.category, art.tags, art.published, art.featured]);
        console.log(`✅ Insertado: ${art.title.slice(0, 60)}...`);
    }
    await client.query('COMMIT');
    console.log('\n🏁 Los 3 artículos fueron insertados correctamente.');
} catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
} finally {
    client.release();
    process.exit(0);
}
