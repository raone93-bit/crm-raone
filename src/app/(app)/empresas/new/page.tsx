import { PageHeader } from "@/components/ui";
import { NewCompanyForm } from "./new-company-form";

export const metadata = { title: "Nova empresa" };

export default function NewCompanyPage() {
  return (
    <div>
      <PageHeader title="Nova empresa" description="Importador, distribuidor, marmoraria, arquiteto, construtora." />
      <NewCompanyForm />
    </div>
  );
}
