// Shared UI helpers for the admin panel.

export const showError = (text, id = 'errorMsg', errorTextId = 'errorText') => {
    const msg = document.getElementById(id);
    const errorText = document.getElementById(errorTextId);
    if (!msg || !errorText) return;
    errorText.textContent = text;
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), 4000);
};

export const showSuccess = (id = 'msg') => {
    const msg = document.getElementById(id);
    if (!msg) return;
    msg.classList.add('visible');
    setTimeout(() => msg.classList.remove('visible'), 3000);
};
