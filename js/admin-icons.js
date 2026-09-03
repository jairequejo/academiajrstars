// Iconos SVG propios y locales, compartidos con el HTML y las ventanas de impresión.
(() => {
  const names = new Set(["chart","camera","users","wallet","ruler","medal","calendar","activity","logout","clipboard","printer","check","alert","error","search","pointer","save","scale","user","phone","ball","plus","close","left","right","refresh","back","qr","radio","ban","clock","cash","school","cup","edit"]);
  const spriteUrl = new URL('../img/admin-icons.svg', document.currentScript.src).href;
  window.adminIcon = (name) => {
    if (!names.has(name)) return '';
    return '<svg class="admin-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="' + spriteUrl + '#' + name + '"></use></svg>';
  };
})();
