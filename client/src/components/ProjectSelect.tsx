import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  number: string;
  name: string;
  startDate?: string | null;
}

interface ProjectSelectProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ProjectSelect({ projects, value, onChange, disabled = false }: ProjectSelectProps) {
  const projects2025 = projects
    .filter((p) => p.number.startsWith("2025-"))
    .sort((a, b) => b.number.localeCompare(a.number));

  const projectsOlder = projects
    .filter((p) => !p.number.startsWith("2025-"))
    .sort((a, b) => {
      if (a.number === "2024-10") return 1;
      if (b.number === "2024-10") return -1;
      return b.number.localeCompare(a.number);
    });

  return (
    <div className="space-y-2">
      <Label htmlFor="project" className={`text-base font-medium ${disabled ? "opacity-50" : ""}`}>
        Projet/Opération
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id="project"
          data-testid="select-project"
          className="h-14 text-base"
        >
          <SelectValue placeholder="Sélectionner un projet..." />
        </SelectTrigger>
        <SelectContent>
          {projects2025.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-sm font-semibold text-primary">
                PROJETS ACTIFS 2025
              </SelectLabel>
              {projects2025.map((project) => (
                <SelectItem
                  key={project.id}
                  value={project.id}
                  data-testid={`option-project-${project.id}`}
                >
                  {project.number} - {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {projectsOlder.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-sm font-semibold text-muted-foreground">
                PROJETS 2024 ET ANTÉRIEURS
              </SelectLabel>
              {projectsOlder.map((project) => (
                <SelectItem
                  key={project.id}
                  value={project.id}
                  data-testid={`option-project-${project.id}`}
                >
                  {project.number} - {project.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
