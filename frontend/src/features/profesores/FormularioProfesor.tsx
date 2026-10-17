import { useState } from "react";
import DialogoProfesor from "./DialogoProfesor";
import { puedeAdministrarAcceso, puedeAdministrarProfesor } from "./permisos";
import { profesoresApi } from "./profesores.api";
import { prepararDatosProfesor } from "./rut";
import type { AlcanceProfesores, DepartamentoProfesor, Profesor, TipoProfesor } from "./types";
import estilos from "./Profesores.module.css";

interface Props {
  profesor?: Profesor;
  departamentos: DepartamentoProfesor[];
  rol?: string;
  alcance: AlcanceProfesores;
  alCerrar: () => void;
  alCompletar: () => void;
}

export default function FormularioProfesor({ profesor, departamentos, rol, alcance, alCerrar, alCompletar }: Props) {
  const destinos = departamentos.filter((departamento) => puedeAdministrarProfesor(rol,
    { departamentoId: departamento.id, tipo: profesor?.tipo ?? "part time" }, alcance));
  const [nombre, setNombre] = useState(profesor?.nombre ?? "");
  const [rut, setRut] = useState(profesor?.rut ?? "");
  const [departamentoId, setDepartamentoId] = useState(profesor?.departamentoId ?? destinos[0]?.id ?? 0);
  const [tipo, setTipo] = useState<TipoProfesor>(profesor?.tipo === "planta" ? "planta" : "part time");
  const [crearAcceso, setCrearAcceso] = useState(false);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const destino = { departamentoId, tipo };
  const permiteAcceso = puedeAdministrarAcceso(rol, destino, alcance);

  function cambiarDepartamento(id: number) {
    setDepartamentoId(id);
    if (!puedeAdministrarAcceso(rol, { departamentoId: id, tipo }, alcance)) {
      setCrearAcceso(false);
      setCorreo("");
      setClave("");
    }
  }

  async function guardar() {
    const datos = prepararDatosProfesor({ rut, nombre, departamentoId, tipo });
    if (!departamentos.some((departamento) => departamento.id === departamentoId)
      || !puedeAdministrarProfesor(rol, destino, alcance)
      || (profesor && !puedeAdministrarProfesor(rol, profesor, alcance))) {
      throw new Error("No tienes permiso para gestionar este profesor o el departamento de destino.");
    }
    if (profesor) return profesoresApi.editar(profesor.id, datos);
    return profesoresApi.crear({ ...datos, ...(crearAcceso && permiteAcceso
      ? { acceso: { correo: correo.trim(), clave } } : {}) });
  }

  return <DialogoProfesor titulo={profesor ? "Editar profesor" : "Agregar profesor"}
    guardar={guardar} alCerrar={alCerrar} alCompletar={alCompletar}>
    <label htmlFor="profesor-nombre">Nombre</label>
    <input id="profesor-nombre" required placeholder="Ej.: Ana Pérez" value={nombre} onChange={(evento) => setNombre(evento.target.value)} autoFocus />
    <label htmlFor="profesor-rut">RUT</label>
    <input id="profesor-rut" type="text" required autoComplete="off" placeholder="Ej.: 12.345.678-5" aria-describedby="ayuda-profesor-rut"
      maxLength={12} pattern="(?:[0-9]{1,8}|[0-9]{1,3}[.][0-9]{3}|[0-9]{1,2}[.][0-9]{3}[.][0-9]{3})-[0-9Kk]"
      title="Ingresa un RUT con guion obligatorio y puntos opcionales, por ejemplo 12.345.678-5."
      value={rut} onChange={(evento) => setRut(evento.target.value)} />
    <p id="ayuda-profesor-rut" className={estilos.ayuda}>El guion es obligatorio; los puntos son opcionales y el dígito verificador puede ser K.</p>
    <label htmlFor="profesor-departamento">Departamento</label>
    <select id="profesor-departamento" required value={departamentoId} onChange={(evento) => cambiarDepartamento(Number(evento.target.value))}>
      {!destinos.length && <option value="">Sin departamentos disponibles</option>}
      {destinos.map((departamento) => <option key={departamento.id} value={departamento.id}>{departamento.nombre}</option>)}
    </select>
    <label htmlFor="profesor-tipo">Tipo</label>
    <select id="profesor-tipo" value={tipo} disabled={rol === "secretaria"}
      onChange={(evento) => setTipo(evento.target.value as TipoProfesor)}>
      <option value="part time">Part time</option><option value="planta">Planta</option>
    </select>
    {rol === "secretaria" && <p className={estilos.ayuda}>{profesor
      ? "Secretaría solo administra profesores part time."
      : "Solo se permite crear docentes part time."} Los accesos se gestionan únicamente en departamentos propios.</p>}
    {!profesor && permiteAcceso && <>
      <label className={estilos.casilla}><input type="checkbox" checked={crearAcceso}
        onChange={(evento) => { setCrearAcceso(evento.target.checked); setCorreo(""); setClave(""); }} />Crear acceso al sistema</label>
      {crearAcceso && <>
        <label htmlFor="profesor-correo">Correo electrónico</label>
        <input id="profesor-correo" type="email" autoComplete="off" required value={correo} onChange={(evento) => setCorreo(evento.target.value)} />
        <label htmlFor="profesor-clave">Contraseña inicial</label>
        <input id="profesor-clave" type="password" autoComplete="new-password" required value={clave} onChange={(evento) => setClave(evento.target.value)} />
      </>}
    </>}
  </DialogoProfesor>;
}
