import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.ts";

const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = process.env;

try {
  if (!BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error("Defina BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD para criar o administrador inicial.");
  }
  if (BOOTSTRAP_ADMIN_PASSWORD.length < 10) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");
  }

  const existingUserCount = await prisma.usuario.count();
  if (existingUserCount > 0) {
    console.log("Seed do administrador ignorado: já existem usuários cadastrados.");
  } else {
    const perfil = await prisma.perfil.upsert({
      where: { nome: "ADMINISTRADOR_SISTEMA" },
      update: {},
      create: { nome: "ADMINISTRADOR_SISTEMA", descricao: "Administração do sistema" },
    });
    await prisma.usuario.create({
      data: {
        nome: BOOTSTRAP_ADMIN_NAME,
        email: BOOTSTRAP_ADMIN_EMAIL,
        senhaHash: await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12),
        perfilId: perfil.id,
      },
    });
    console.log("Administrador inicial criado pelo seed.");
  }
} finally {
  await prisma.$disconnect();
}
