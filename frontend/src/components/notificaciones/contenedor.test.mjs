import test from 'node:test';
import assert from 'node:assert/strict';
import { ubicarContenedorNotificaciones } from './contenedor.ts';

// Comprueba el ciclo de ubicación sin simular visibilidad ni un lector de pantalla.
function entorno() {
  let observar;
  let desconectado = false;
  const dialogos = [];
  const cuerpo = { appendChild(elemento) { elemento.parentElement = this; } };
  const documento = {
    body: cuerpo,
    activeElement: null,
    querySelectorAll: () => dialogos.filter(dialogo => dialogo.matches()),
    defaultView: { MutationObserver: class {
      constructor(accion) { observar = accion; }
      observe() {}
      disconnect() { desconectado = true; }
    } },
  };
  const contenedor = { parentElement: null, remove() { this.parentElement = null; } };
  function dialogo() {
    const elemento = { abierto: false, isConnected: true,
      matches() { return this.abierto && this.isConnected; },
      appendChild(hijo) { hijo.parentElement = this; },
    };
    dialogos.push(elemento);
    return elemento;
  }
  return { documento, contenedor, cuerpo, dialogo, desconectado: () => desconectado,
    cambiar(elemento, abierto) { elemento.abierto = abierto; observar([{ type: 'attributes', target: elemento, attributeName: 'open' }]); },
    retirar(elemento) { elemento.isConnected = false; observar([{ type: 'childList', target: cuerpo }]); },
  };
}

test('el mismo contenedor acompaña al diálogo modal y vuelve al documento al cerrar', () => {
  const e = entorno();
  const limpiar = ubicarContenedorNotificaciones(e.contenedor, e.documento);
  assert.equal(e.contenedor.parentElement, e.cuerpo);
  const dialogo = e.dialogo();
  e.cambiar(dialogo, true);
  assert.equal(e.contenedor.parentElement, dialogo);
  e.cambiar(dialogo, false);
  assert.equal(e.contenedor.parentElement, e.cuerpo);
  limpiar();
  assert.equal(e.contenedor.parentElement, null);
  assert.equal(e.desconectado(), true);
});

test('la última apertura manda sobre el orden DOM y cerrar o desmontar recupera el modal anterior', () => {
  const e = entorno();
  const primeroEnDom = e.dialogo();
  const segundoEnDom = e.dialogo();
  const limpiar = ubicarContenedorNotificaciones(e.contenedor, e.documento);
  e.cambiar(segundoEnDom, true);
  e.cambiar(primeroEnDom, true);
  assert.equal(e.contenedor.parentElement, primeroEnDom);
  e.cambiar(primeroEnDom, false);
  assert.equal(e.contenedor.parentElement, segundoEnDom);
  e.cambiar(primeroEnDom, true);
  e.retirar(primeroEnDom);
  assert.equal(e.contenedor.parentElement, segundoEnDom);
  e.retirar(segundoEnDom);
  assert.equal(e.contenedor.parentElement, e.cuerpo);
  limpiar();
});

test('si ya hay un modal al montar se utiliza sin crear otro contenedor', () => {
  const e = entorno();
  const dialogo = e.dialogo();
  dialogo.abierto = true;
  const limpiar = ubicarContenedorNotificaciones(e.contenedor, e.documento);
  assert.equal(e.contenedor.parentElement, dialogo);
  limpiar();
});
