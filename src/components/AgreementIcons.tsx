import { Briefcase, FilePen, Globe, Handshake, Home, Lightbulb, Lock, UserX, Users } from "lucide-react";

export const TEMPLATE_ICONS: Record<string, typeof FilePen> = {
  nda: Lock, rental: Home, employment: Users, freelance: Briefcase, terms: Globe,
  partnership: Handshake, nonsolicit: UserX, business_plan: Lightbulb, custom: FilePen
};
