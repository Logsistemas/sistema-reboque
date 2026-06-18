/**
 * Fotos do checklist do motorista — lightbox, download e impressão.
 */
(function () {
  'use strict';

  function resolverUrlFotoChecklist(foto) {
    const raw = String(foto || '').trim();
    if (!raw) return { url: '', valid: false, raw, erro: 'vazio' };

    if (raw.startsWith('data:image')) {
      return { url: raw, valid: true, raw, erro: '' };
    }

    const low = raw.toLowerCase();
    if (low.startsWith('file://') || low.startsWith('content://') || low.startsWith('ph://')) {
      return { url: '', valid: false, raw, erro: 'uri_local_dispositivo' };
    }

    if (low.startsWith('http://') || low.startsWith('https://')) {
      return { url: raw, valid: true, raw, erro: '' };
    }

    if (raw.startsWith('/static/')) {
      return { url: raw, valid: true, raw, erro: '' };
    }

    if (raw.startsWith('/uploads/')) {
      return { url: '/static' + raw, valid: true, raw, erro: '' };
    }

    if (raw.startsWith('uploads/')) {
      return { url: '/static/' + raw.replace(/^\/+/, ''), valid: true, raw, erro: '' };
    }

    if (raw.startsWith('/')) {
      const path = raw.startsWith('/static/') ? raw : '/static' + raw;
      return { url: path, valid: true, raw, erro: '' };
    }

    if (raw.length > 200) {
      return { url: 'data:image/jpeg;base64,' + raw, valid: true, raw, erro: '' };
    }

    return { url: '/static/' + raw.replace(/^\/+/, ''), valid: true, raw, erro: '' };
  }

  function ensureLightbox() {
    let el = document.getElementById('chkFotoLightbox');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'chkFotoLightbox';
    el.className = 'chk-lightbox';
    el.innerHTML =
      '<div class="chk-lightbox-backdrop" data-chk-fechar></div>' +
      '<div class="chk-lightbox-panel">' +
      '<button type="button" class="chk-lightbox-fechar" data-chk-fechar aria-label="Fechar">&times;</button>' +
      '<p class="chk-lightbox-titulo"></p>' +
      '<img class="chk-lightbox-img" alt="Foto ampliada">' +
      '</div>';
    document.body.appendChild(el);

    el.querySelectorAll('[data-chk-fechar]').forEach(function (btn) {
      btn.addEventListener('click', fecharLightbox);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') fecharLightbox();
    });
    return el;
  }

  function mensagemFotoIndisponivel(info) {
    if (info.erro === 'uri_local_dispositivo') {
      return 'Foto antiga do dispositivo — reenviar checklist para visualizar na Central.';
    }
    return 'Foto não disponível para visualização.';
  }

  function abrirFotoChecklist(url, titulo) {
    const info = resolverUrlFotoChecklist(url);
    if (!info.valid || !info.url) {
      alert(mensagemFotoIndisponivel(info));
      return;
    }
    const box = ensureLightbox();
    box.querySelector('.chk-lightbox-titulo').textContent = titulo || 'Foto do checklist';
    box.querySelector('.chk-lightbox-img').src = info.url;
    box.classList.add('open');
    document.body.classList.add('chk-lightbox-open');
  }

  function fecharLightbox() {
    const box = document.getElementById('chkFotoLightbox');
    if (!box) return;
    box.classList.remove('open');
    document.body.classList.remove('chk-lightbox-open');
    const img = box.querySelector('.chk-lightbox-img');
    if (img) img.removeAttribute('src');
  }

  function baixarFotoChecklist(url, nomeArquivo) {
    const info = resolverUrlFotoChecklist(url);
    if (!info.valid || !info.url) {
      alert(
        info.erro === 'uri_local_dispositivo'
          ? 'Foto antiga do dispositivo — reenviar checklist para visualizar na Central.'
          : 'Foto não disponível para download.'
      );
      return;
    }

    const nome = (nomeArquivo || 'checklist_foto.jpg').replace(/[^\w.\-]+/g, '_');
    const link = document.createElement('a');
    link.href = info.url;
    link.download = nome;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function imprimirChecklist() {
    window.print();
  }

  function onImgErro(img) {
    if (!img || img.dataset.chkErro) return;
    img.dataset.chkErro = '1';
    img.classList.add('chk-foto-erro');
    img.removeAttribute('src');
    const wrap = img.closest('.chk-foto-card');
    if (wrap) wrap.classList.add('chk-foto-card-erro');
  }

  function bindChecklistFotos(root) {
    const scope = root || document;

    scope.querySelectorAll('[data-chk-abrir]').forEach(function (btn) {
      if (btn.dataset.chkBound) return;
      btn.dataset.chkBound = '1';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        abrirFotoChecklist(btn.dataset.url || '', btn.dataset.titulo || 'Foto');
      });
    });

    scope.querySelectorAll('[data-chk-baixar]').forEach(function (btn) {
      if (btn.dataset.chkBoundDownload) return;
      btn.dataset.chkBoundDownload = '1';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        baixarFotoChecklist(btn.dataset.url || '', btn.dataset.nome || 'checklist_foto.jpg');
      });
    });

    scope.querySelectorAll('img[data-chk-foto]').forEach(function (img) {
      if (img.dataset.chkErroBound) return;
      img.dataset.chkErroBound = '1';
      img.addEventListener('error', function () {
        onImgErro(img);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindChecklistFotos(document);
    document.querySelectorAll('[data-chk-imprimir]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        imprimirChecklist();
      });
    });
  });

  window.resolverUrlFotoChecklist = resolverUrlFotoChecklist;
  window.abrirFotoChecklist = abrirFotoChecklist;
  window.baixarFotoChecklist = baixarFotoChecklist;
  window.imprimirChecklist = imprimirChecklist;
  window.bindChecklistFotos = bindChecklistFotos;
})();
