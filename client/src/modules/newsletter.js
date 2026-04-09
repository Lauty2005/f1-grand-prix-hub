// client/src/modules/newsletter.js
// ────────────────────────────────────────────────────────────────
// NEWSLETTER FORM: Capturar emails de usuarios
// Es el componente más importante para growth (fidelización)
// ────────────────────────────────────────────────────────────────

import { API } from './config.js';

/**
 * Renderizar formulario de newsletter en un elemento específico
 * @param {string|Element} containerId - ID del contenedor o elemento DOM
 * @param {object} options - Opciones de personalización
 * 
 * @example
 * renderNewsletterForm('newsletter-container', {
 *   title: 'Suscribite al análisis semanal',
 *   buttonText: 'Recibir análisis',
 *   onSuccess: () => console.log('¡Email capturado!')
 * });
 */
export function renderNewsletterForm(containerId, options = {}) {
    const container = typeof containerId === 'string' 
        ? document.getElementById(containerId)
        : containerId;

    if (!container) {
        console.error(`Newsletter: Contenedor "${containerId}" no encontrado`);
        return;
    }

    const {
        title = '⚡ Resumen F1 semanal',
        subtitle = 'Análisis, predicciones y datos que no ves en otros lados',
        buttonText = 'Suscribirse',
        placeholderText = 'tu@email.com',
        onSuccess = null,
        compact = false // Modo compacto para sidebar
    } = options;

    const formHTML = compact ? createCompactForm() : createFullForm();

    container.innerHTML = formHTML;

    // Event listeners
    const form = container.querySelector('#newsletter-form');
    const emailInput = container.querySelector('#newsletter-email');
    const submitBtn = container.querySelector('#newsletter-submit');
    const messageEl = container.querySelector('#newsletter-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleNewsletterSubmit(emailInput, submitBtn, messageEl, onSuccess);
    });

    function createFullForm() {
        return `
            <div class="newsletter-box">
                <h3 class="newsletter-title">${title}</h3>
                <p class="newsletter-subtitle">${subtitle}</p>
                
                <form id="newsletter-form" class="newsletter-form">
                    <div class="form-group">
                        <input
                            type="email"
                            id="newsletter-email"
                            class="newsletter-input"
                            placeholder="${placeholderText}"
                            required
                            aria-label="Email para newsletter"
                        />
                        <button
                            type="submit"
                            id="newsletter-submit"
                            class="newsletter-button"
                            aria-label="Suscribirse a newsletter"
                        >
                            ${buttonText}
                        </button>
                    </div>
                    <p class="newsletter-message" id="newsletter-message" style="display:none;"></p>
                </form>
                
                <p class="newsletter-disclaimer">
                    No spam. Análisis F1 profesional cada semana.
                </p>
            </div>
        `;
    }

    function createCompactForm() {
        return `
            <div class="newsletter-compact">
                <span class="newsletter-label">Análisis semanal de F1</span>
                <form id="newsletter-form" class="newsletter-form-compact">
                    <input
                        type="email"
                        id="newsletter-email"
                        placeholder="Email"
                        required
                    />
                    <button type="submit" id="newsletter-submit">↓</button>
                </form>
                <p id="newsletter-message" style="display:none; font-size:0.75rem;"></p>
            </div>
        `;
    }
}

/**
 * Manejar el submit del formulario
 * @private
 */
async function handleNewsletterSubmit(emailInput, submitBtn, messageEl, onSuccess) {
    const email = emailInput.value.trim();
    
    // Validación básica
    if (!isValidEmail(email)) {
        showMessage(messageEl, '❌ Email inválido', 'error');
        return;
    }

    // Deshabilitar botón mientras se procesa
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Cargando...';

    try {
        // Enviar al servidor
        const response = await fetch(`${API}/newsletter/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Error al suscribirse');
        }

        // ✅ ÉXITO
        showMessage(messageEl, '✅ ¡Bienvenido! Revisa tu email', 'success');
        emailInput.value = '';

        // Trackear en analytics
        trackEvent('newsletter_subscribe', { email });

        // Callback opcional
        if (onSuccess) onSuccess();

        // Opcional: Esconder form después de 3 segundos
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);

    } catch (error) {
        console.error('Newsletter error:', error);
        showMessage(messageEl, `❌ ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Mostrar mensaje (success/error)
 * @private
 */
function showMessage(element, message, type = 'info') {
    element.textContent = message;
    element.style.display = 'block';
    element.className = `newsletter-message message-${type}`;
}

/**
 * Validar email format
 * @private
 */
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * Trackear evento en Google Analytics o equivalente
 * @private
 */
function trackEvent(eventName, eventData = {}) {
    if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', eventName, eventData);
    }
    // También loguear en consola para debugging
    console.log(`📊 Event: ${eventName}`, eventData);
}

// ────────────────────────────────────────────────────────────────
// ESTILOS CSS
// ────────────────────────────────────────────────────────────────

export const NEWSLETTER_STYLES = `
/* Newsletter Box - Full Version */
.newsletter-box {
    background: linear-gradient(135deg, rgba(225, 6, 0, 0.1) 0%, rgba(225, 6, 0, 0.05) 100%);
    border: 1px solid rgba(225, 6, 0, 0.2);
    border-radius: 12px;
    padding: 24px;
    margin: 20px 0;
    text-align: center;
}

.newsletter-title {
    margin: 0 0 8px 0;
    font-size: 1.3rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.5px;
}

.newsletter-subtitle {
    margin: 0 0 16px 0;
    color: #aaa;
    font-size: 0.9rem;
    line-height: 1.4;
}

.newsletter-form {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.form-group {
    display: flex;
    gap: 8px;
    width: 100%;
}

.newsletter-input {
    flex: 1;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(225, 6, 0, 0.3);
    border-radius: 6px;
    color: #fff;
    font-size: 0.9rem;
    outline: none;
    transition: all 0.2s;
}

.newsletter-input:focus {
    background: rgba(0, 0, 0, 0.4);
    border-color: #e10600;
    box-shadow: 0 0 0 2px rgba(225, 6, 0, 0.1);
}

.newsletter-input::placeholder {
    color: #666;
}

.newsletter-button {
    padding: 10px 24px;
    background: #e10600;
    border: none;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
}

.newsletter-button:hover:not(:disabled) {
    background: #c50500;
    transform: translateY(-2px);
}

.newsletter-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.newsletter-message {
    font-size: 0.85rem;
    padding: 8px 0;
    border-radius: 4px;
}

.message-success {
    color: #4ade80;
}

.message-error {
    color: #ef4444;
}

.newsletter-disclaimer {
    margin: 0;
    font-size: 0.75rem;
    color: #666;
    margin-top: 8px;
}

/* Responsive */
@media (max-width: 640px) {
    .newsletter-box {
        padding: 16px;
        margin: 16px 0;
    }
    
    .newsletter-form {
        flex-direction: column;
    }
    
    .form-group {
        flex-direction: column;
    }
    
    .newsletter-button {
        width: 100%;
    }
}

/* Newsletter Compact - Sidebar Version */
.newsletter-compact {
    border-left: 2px solid #e10600;
    padding: 12px 16px;
    background: rgba(225, 6, 0, 0.05);
}

.newsletter-label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #aaa;
    margin-bottom: 8px;
}

.newsletter-form-compact {
    display: flex;
    gap: 6px;
}

.newsletter-form-compact input {
    flex: 1;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(225, 6, 0, 0.2);
    border-radius: 4px;
    color: #fff;
    font-size: 0.8rem;
}

.newsletter-form-compact button {
    padding: 6px 10px;
    background: #e10600;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
}
`;

export default {
    renderNewsletterForm,
    NEWSLETTER_STYLES
};
