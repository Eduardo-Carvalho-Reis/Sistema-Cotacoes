export function isAdmin(usuario) {
  return ["ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"].includes(usuario?.perfil);
}

export function assertObraAccess(usuario, obraId) {
  if (!isAdmin(usuario) && Number(usuario?.obraId) !== Number(obraId)) {
    const error = new Error("Worksite access denied.");
    error.status = 403;
    throw error;
  }
}

export function obraScope(usuario, field = "obraId") {
  return isAdmin(usuario) ? {} : { [field]: usuario?.obraId ?? -1 };
}

export function isAdminUser(usuario) {
  return isAdmin(usuario);
}

export function permitir(...perfis) {
  return (req, res, next) => perfis.includes(req.usuario?.perfil)
    ? next()
    : res.status(403).json({ erro: "Insufficient permission." });
}
