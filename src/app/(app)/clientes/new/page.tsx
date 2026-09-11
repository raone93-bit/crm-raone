import { PageHeader } from "@/components/ui";
import { NewContactForm } from "./new-contact-form";

export const metadata = { title: "Novo contato" };

export default function NewContactPage() {
  return (
    <div>
      <PageHeader title="Novo contato" description="Cadastro manual de uma pessoa que entrou em contato." />
      <NewContactForm />
    </div>
  );
}
