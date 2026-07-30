import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfilForUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeGerenciarUsuarios } from "@/lib/permissoes";
import UsuariosClient, { type UsuarioLinha } from "./usuarios-client";

// Tela de Usuários (Fase 1 do módulo Financeiro — controle de acesso).
// Só o "dono" acessa: convida novos usuários e muda o papel de quem já
// existe. Checagem em dobro — aqui na página (Server Component) e nas
// políticas de RLS/API route — porque a página sozinha não impede
// alguém de chamar a API diretamente.
export default async function UsuariosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meuPerfil = await getPerfilForUserId(user.id);

  if (!podeGerenciarUsuarios(meuPerfil.papel)) {
    return (
      <div>
        <h1 style={{ marginBottom: 6 }}>Usuários</h1>
        <p className="alert-error">
          Só o dono da conta pode gerenciar usuários. Fale com o dono da empresa se precisar de acesso.
        </p>
      </div>
    );
  }

  const perfis = await prisma.perfil.findMany({
    where: { tenantId: meuPerfil.tenantId },
    orderBy: { createdAt: "asc" },
  });

  const linhas: UsuarioLinha[] = perfis.map((p: (typeof perfis)[number]) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    papel: p.papel,
    souEu: p.id === user.id,
  }));

  return <UsuariosClient usuariosIniciais={linhas} />;
}
