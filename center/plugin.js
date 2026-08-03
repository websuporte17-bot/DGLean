// Arquivo: dg-auto.js (Hospedado no seu servidor)
if (!window.dgPainelAtivo) {
    window.dgPainelAtivo = true;

    // Salva a URL atual e prepara o ambiente
    var urlAtual = window.location.href;
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.backgroundColor = '#000';

    // Cria o Iframe carregando o site
    var frame = document.createElement('iframe');
    frame.src = urlAtual; // Ou coloque 'https://lulu.com' fixo aqui se preferir
    frame.style.width = '100vw';
    frame.style.height = '100vh';
    frame.style.border = 'none';
    document.body.appendChild(frame);

    // Cria a DOM Flutuante
    var dgBtn = document.createElement('div');
    dgBtn.innerHTML = 'DG AUTOMAÇÃO';
    dgBtn.style.position = 'fixed';
    dgBtn.style.top = '50px';
    dgBtn.style.left = '20px';
    dgBtn.style.padding = '12px 24px';
    dgBtn.style.background = '#111';
    dgBtn.style.color = '#00ff00';
    dgBtn.style.border = '2px solid #00ff00';
    dgBtn.style.borderRadius = '8px';
    dgBtn.style.fontFamily = 'monospace';
    dgBtn.style.fontWeight = 'bold';
    dgBtn.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.4)';
    dgBtn.style.zIndex = '999999';
    dgBtn.style.userSelect = 'none';
    document.body.appendChild(dgBtn);

    // Lógica de arrastar (Touch e Mouse)
    var arrastando = false, startX, startY, initialX, initialY;

    function iniciarDrag(e) {
        arrastando = true;
        var ev = e.touches ? e.touches[0] : e;
        startX = ev.clientX; startY = ev.clientY;
        initialX = dgBtn.offsetLeft; initialY = dgBtn.offsetTop;
    }

    function moverDrag(e) {
        if(!arrastando) return;
        var ev = e.touches ? e.touches[0] : e;
        dgBtn.style.left = (initialX + ev.clientX - startX) + 'px';
        dgBtn.style.top = (initialY + ev.clientY - startY) + 'px';
    }

    function pararDrag() { arrastando = false; }

    dgBtn.addEventListener('mousedown', iniciarDrag);
    window.addEventListener('mousemove', moverDrag);
    window.addEventListener('mouseup', pararDrag);
    dgBtn.addEventListener('touchstart', iniciarDrag, {passive: false});
    window.addEventListener('touchmove', moverDrag, {passive: false});
    window.addEventListener('touchend', pararDrag);
}
