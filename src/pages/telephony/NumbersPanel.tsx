import {
  ExternalLink,
  Loader2,
  Mic,
  Phone,
  Search,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { Loader } from "@/components/Loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CenteredDialogContent,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import {
  activateAccount,
  dismissOrder,
  formatPhone,
  formatPrice,
  getNumbersOverview,
  listAvailableNumbers,
  markOrderPaid,
  orderNumber,
  quoteNumber,
  reconfigureNumber,
  releaseNumber,
  searchZones,
  syncCalls,
  type AvailableNumber,
  type NumberChoice,
  type NumberOrder,
  type NumberQuote,
  type NumbersOverview,
  type OwnedNumber,
} from "@/lib/telephony";

const STATE_LABEL: Record<
  OwnedNumber["state"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  actif: { label: "Actif", variant: "success" },
  configuration: { label: "Configuration…", variant: "warning" },
  a_configurer: { label: "À configurer", variant: "outline" },
  erreur: { label: "Erreur", variant: "destructive" },
  resiliation: { label: "Résiliation en cours", variant: "outline" },
};

const ORDER_LABEL: Record<
  NumberOrder["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  a_regler: { label: "Paiement en attente", variant: "warning" },
  en_cours: { label: "Activation en cours…", variant: "warning" },
  documents: { label: "Justificatifs demandés", variant: "destructive" },
  terminee: { label: "Terminée", variant: "success" },
};

// ---------- Tes numéros ----------

function OwnedNumbers({
  numbers,
  onReconfigure,
  onRelease,
  busy,
}: {
  numbers: OwnedNumber[];
  onReconfigure: (serviceName: string) => void;
  onRelease: (serviceName: string) => void;
  busy: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Tes numéros</p>
        {numbers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun numéro pour l'instant.
          </p>
        )}
        {numbers.map((n) => {
          const state = STATE_LABEL[n.state];
          return (
            <div
              key={n.serviceName}
              className="flex flex-col gap-2 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <Phone className="size-4 shrink-0 text-primary" />
                  <span className="font-medium">
                    {formatPhone(n.serviceName)}
                  </span>
                  <Badge variant={state.variant} className="text-[10px]">
                    {state.label}
                  </Badge>
                </div>
                {n.state !== "resiliation" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy === n.serviceName}
                    onClick={() => onRelease(n.serviceName)}
                    aria-label="Supprimer ce numéro"
                  >
                    {busy === n.serviceName ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                )}
              </div>
              {n.state === "actif" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Sonne sur tes téléphones
                  {n.recording && (
                    <>
                      {" · "}
                      <Mic className="size-3" /> appels enregistrés
                    </>
                  )}
                </p>
              )}
              {n.state === "a_configurer" && (
                <p className="text-xs text-muted-foreground">
                  Ajoute ton téléphone dans Réglages pour activer le renvoi.
                </p>
              )}
              {n.state === "erreur" && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-destructive">{n.error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={busy === n.serviceName}
                    onClick={() => onReconfigure(n.serviceName)}
                  >
                    Réessayer
                  </Button>
                </div>
              )}
              {n.state === "resiliation" && (
                <p className="text-xs text-muted-foreground">
                  Le numéro reste actif jusqu'à la fin de la période déjà payée.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Commandes en cours ----------

function Orders({
  orders,
  onDismiss,
  onPaid,
}: {
  orders: NumberOrder[];
  onDismiss: (id: string) => void;
  onPaid: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Commandes</p>
        {orders.map((o) => {
          const state = ORDER_LABEL[o.status];
          return (
            <div
              key={o.id}
              className="flex flex-col gap-2 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">
                    {o.number
                      ? `${formatPhone(o.number)} · ${o.label}`
                      : o.label}
                  </p>
                  {o.total ? (
                    <p className="text-xs text-muted-foreground">
                      {formatPrice({
                        value: o.total,
                        currency: o.currency ?? "EUR",
                      })}{" "}
                      {o.currency === "USD" ? "HT" : "TTC"}
                    </p>
                  ) : null}
                </div>
                <Badge variant={state.variant} className="shrink-0 text-[10px]">
                  {state.label}
                </Badge>
              </div>
              {o.status === "en_cours" && o.paidReported && (
                <p className="text-xs text-muted-foreground">
                  Paiement reçu de ton côté : l'opérateur valide la commande
                  puis le numéro apparaît ici tout seul. Ça peut prendre de
                  quelques minutes à quelques heures.
                </p>
              )}
              {o.status === "a_regler" && o.actionUrl && (
                <p className="text-xs text-muted-foreground">
                  Le paiement automatique n'a pas pu se faire : règle la
                  commande avec le bouton ci-dessous, puis appuie sur « J'ai
                  payé ».
                </p>
              )}
              {o.status === "en_cours" &&
                !o.paidReported &&
                Date.now() - new Date(o.createdAt).getTime() >
                  10 * 60 * 1000 && (
                  <p className="text-xs text-muted-foreground">
                    Plus long que prévu.{" "}
                    {o.actionUrl
                      ? "Si rien n'avance, finalise la commande ci-dessous."
                      : "Contacte le support si ça dure."}
                  </p>
                )}
              {(o.status === "a_regler" || o.actionUrl) && (
                <div className="flex flex-wrap gap-2">
                  {o.actionUrl && (
                    <Button size="sm" asChild>
                      <a href={o.actionUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" />{" "}
                        {o.status === "a_regler"
                          ? "Finaliser le paiement"
                          : "Finaliser la commande"}
                      </a>
                    </Button>
                  )}
                  {o.status === "a_regler" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPaid(o.id)}
                      >
                        J'ai payé
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDismiss(o.id)}
                      >
                        Annuler
                      </Button>
                    </>
                  )}
                </div>
              )}
              {o.status === "documents" && (
                <p className="text-xs text-muted-foreground">
                  L'opérateur demande des justificatifs d'identité pour
                  attribuer ce numéro : contacte le support.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Achat ----------

function ConfirmPurchase({
  choice,
  instant,
  onClose,
  onDone,
}: {
  choice: NumberChoice | null;
  instant: boolean;
  onClose: () => void;
  onDone: (status: "en_cours" | "a_regler" | "documents" | "terminee") => void;
}) {
  const { session } = useAuth();
  const [quote, setQuote] = React.useState<NumberQuote | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setQuote(null);
    setError(null);
    if (!choice || !session) return;
    let cancelled = false;
    quoteNumber(session.sessionId, choice)
      .then((q) => !cancelled && setQuote(q))
      .catch(
        (e) =>
          !cancelled &&
          setError(friendlyError(e, "Impossible de calculer le prix.")),
      );
    return () => {
      cancelled = true;
    };
  }, [choice, session]);

  const confirm = async () => {
    if (!choice || !quote || !session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await orderNumber(
        session.sessionId,
        choice,
        quote.totalTtc.value,
      );
      onDone(result.status);
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'achat."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={choice !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <CenteredDialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer l'achat</DialogTitle>
          <DialogDescription>
            {choice?.specificNumber
              ? `${formatPhone(choice.specificNumber)} · `
              : "Numéro attribué automatiquement · "}
            {choice?.zone}
          </DialogDescription>
        </DialogHeader>

        {!quote && !error && <Loader className="py-4" />}
        {quote && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1.5">
              {quote.lines.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-muted-foreground">
                    {l.label}
                    {l.recurring ? " (par mois)" : ""}
                  </span>
                  <span className="shrink-0">{formatPrice(l.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-2 font-semibold">
              <span>
                {instant
                  ? "Total aujourd'hui (HT)"
                  : "Total à payer aujourd'hui (TTC)"}
              </span>
              <span>{formatPrice(quote.totalTtc)}</span>
            </div>
            {instant ? (
              <p className="text-xs text-muted-foreground">
                Débité du crédit téléphonie du compte : rien à payer ici. Le
                numéro est actif en général en quelques secondes, puis
                l'abonnement se renouvelle chaque mois. Tu peux le supprimer à
                tout moment.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Le numéro est activé tout de suite : tu renonces au délai de
                rétractation. L'abonnement est mensuel et se renouvelle
                automatiquement ; tu peux résilier à tout moment. Le règlement
                utilise le moyen de paiement enregistré sur ton compte ; si ce
                n'est pas possible, un lien de paiement te sera proposé.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={confirm} disabled={!quote || busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : quote ? (
              `${instant ? "Acheter" : "Payer"} ${formatPrice(quote.totalTtc)}`
            ) : instant ? (
              "Acheter"
            ) : (
              "Payer"
            )}
          </Button>
        </DialogFooter>
      </CenteredDialogContent>
    </Dialog>
  );
}

function BuyNumber({
  missing,
  missingLegal,
  onMissing,
  onChoose,
}: {
  missing: NumbersOverview["missing"];
  missingLegal: string[];
  onMissing: () => void;
  onChoose: (choice: NumberChoice) => void;
}) {
  const { session } = useAuth();
  const [query, setQuery] = React.useState("");
  const [zones, setZones] = React.useState<string[]>([]);
  const [zone, setZone] = React.useState<string | null>(null);
  const [numbers, setNumbers] = React.useState<AvailableNumber[] | null>(null);
  const [loadingNumbers, setLoadingNumbers] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!session || query.trim().length < 3) {
      setZones([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchZones(session.sessionId, query.trim())
        .then((z) => !cancelled && setZones(z.slice(0, 8)))
        .catch(() => !cancelled && setZones([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, session]);

  const pickZone = (z: string) => {
    setZone(z);
    setNumbers(null);
    setFilter("");
    setError(null);
    setZones([]);
    setQuery(z);
  };

  const showNumbers = async () => {
    if (!session || !zone) return;
    setLoadingNumbers(true);
    setError(null);
    try {
      setNumbers(await listAvailableNumbers(session.sessionId, zone));
    } catch (e) {
      setError(friendlyError(e, "Erreur de recherche."));
    } finally {
      setLoadingNumbers(false);
    }
  };

  const shown = (numbers ?? [])
    .filter((n) =>
      formatPhone(n.number)
        .replace(/\s/g, "")
        .includes(filter.replace(/\s/g, "")),
    )
    .slice(0, 40);
  // Indicatif de la ville (01 à Paris, 04 à Lyon…), connu dès que la liste est chargée.
  const prefix = numbers?.[0]
    ? formatPhone(numbers[0].number).slice(0, 2)
    : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Acheter un numéro fixe</p>

        {missing.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <p>
              Avant d'acheter, complète dans Réglages :{" "}
              {[
                missing.includes("phone") && "ton téléphone de renvoi",
                missing.includes("legal") &&
                  `les informations de l'entreprise (il manque : ${missingLegal.join(", ")})`,
              ]
                .filter(Boolean)
                .join(" et ")}
              , puis appuie sur « Enregistrer ».
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={onMissing}
            >
              Ouvrir les réglages
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Ville ou code postal (Paris, Lyon, 75008…)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setZone(null);
              setNumbers(null);
            }}
            disabled={missing.length > 0}
          />
        </div>

        {zones.length > 0 && !zone && (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <Button
                key={z}
                variant="outline"
                size="sm"
                onClick={() => pickZone(z)}
              >
                {z}
              </Button>
            ))}
          </div>
        )}
        {query.trim().length >= 3 && zones.length === 0 && !zone && (
          <p className="text-xs text-muted-foreground">Aucune ville trouvée.</p>
        )}

        {zone && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
              <p className="text-sm font-medium">
                Numéro attribué automatiquement
              </p>
              <p className="text-xs text-muted-foreground">
                Un numéro {prefix ? `${prefix} ` : ""}standard de {zone}, choisi
                par l'opérateur. Le prix exact s'affiche avant de payer.
              </p>
              <Button
                size="sm"
                className="w-fit"
                disabled={missing.length > 0}
                onClick={() => onChoose({ zone, specificNumber: null })}
              >
                Acheter
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-3">
              <p className="text-sm font-medium">Choisir mon numéro</p>
              {numbers === null ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={showNumbers}
                  disabled={loadingNumbers}
                >
                  {loadingNumbers ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Voir les numéros disponibles"
                  )}
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Chercher des chiffres (ex. 1000, 77…)"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  {shown.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Aucun numéro ne correspond.
                    </p>
                  )}
                  {shown.some((n) => n.premium) && (
                    <p className="text-xs text-muted-foreground">
                      Les numéros « Premium » sont plus faciles à retenir mais
                      plus chers : le prix exact s'affiche avant de payer.
                    </p>
                  )}
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                    {shown.map((n) => (
                      <div
                        key={n.number}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatPhone(n.number)}
                          </span>
                          {n.monthly !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {formatPrice({
                                value: n.monthly,
                                currency: n.currency ?? "USD",
                              })}
                              /mois
                            </span>
                          )}
                          {n.premium && (
                            <Badge variant="warning" className="text-[10px]">
                              Premium
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          disabled={missing.length > 0}
                          onClick={() =>
                            onChoose({ zone, specificNumber: n.number })
                          }
                        >
                          Acheter
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ---------- Onglet ----------

// Onglet Numéros : activer la téléphonie (une fois), chercher, acheter et
// résilier des numéros 01 sans jamais quitter l'app. Le prix exact est
// toujours montré et confirmé avant tout achat.
export function NumbersPanel({
  refreshKey,
  onOpenSettings,
  onChanged,
}: {
  refreshKey: number;
  onOpenSettings: () => void;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const [overview, setOverview] = React.useState<NumbersOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState<NumberChoice | null>(null);
  const [releasing, setReleasing] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 12000);
    return () => clearTimeout(timer);
  }, [message]);

  const load = React.useCallback(() => {
    if (!session) return;
    getNumbersOverview(session.sessionId)
      .then(setOverview)
      .catch((e) => setError(friendlyError(e, "Erreur de chargement.")));
  }, [session]);

  React.useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Tant qu'une commande ou une configuration est en cours, on relève
  // l'avancement toutes les quelques secondes au lieu d'attendre la minute.
  const inProgress =
    !!overview &&
    (overview.account === "pending" ||
      overview.orders.some(
        (o) => o.status === "en_cours" || o.status === "a_regler",
      ) ||
      overview.numbers.some((n) => n.state === "configuration"));
  React.useEffect(() => {
    if (!inProgress || !session) return;
    const timer = setInterval(() => {
      syncCalls(session.sessionId)
        .catch(() => {})
        .finally(() => {
          load();
          onChanged();
        });
    }, 8000);
    return () => clearInterval(timer);
  }, [inProgress, session, load, onChanged]);

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    fallback: string,
  ) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      load();
      onChanged();
    } catch (e) {
      setError(friendlyError(e, fallback));
    } finally {
      setBusy(null);
    }
  };

  if (!overview)
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <Loader className="py-8" />
    );

  if (!overview.configured) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        La téléphonie n'est pas encore branchée sur ton compte. Contacte le
        support pour l'activer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}

      {(overview.numbers.length > 0 || overview.account === "ready") && (
        <OwnedNumbers
          numbers={overview.numbers}
          busy={busy}
          onReconfigure={(sn) =>
            run(
              sn,
              () => reconfigureNumber(session!.sessionId, sn),
              "Erreur de configuration.",
            )
          }
          onRelease={setReleasing}
        />
      )}

      {overview.orders.length > 0 && (
        <Orders
          orders={overview.orders}
          onDismiss={(id) =>
            run(
              id,
              () => dismissOrder(session!.sessionId, id),
              "Erreur lors de l'annulation.",
            )
          }
          onPaid={(id) =>
            run(
              id,
              () => markOrderPaid(session!.sessionId, id),
              "Erreur, réessaie.",
            )
          }
        />
      )}

      {overview.account !== "ready" && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-semibold">Activer la téléphonie</p>
            {overview.account === "pending" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Activation en cours,
                quelques instants…
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Première étape, gratuite : active la téléphonie sur ton compte
                  pour pouvoir acheter des numéros fixes (01, 04…).
                </p>
                <Button
                  className="w-fit"
                  disabled={busy === "activate"}
                  onClick={() =>
                    run(
                      "activate",
                      () => activateAccount(session!.sessionId),
                      "Erreur lors de l'activation.",
                    )
                  }
                >
                  {busy === "activate" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Activer"
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {overview.account === "ready" && (
        <BuyNumber
          missing={overview.missing}
          missingLegal={overview.missingLegal}
          onMissing={onOpenSettings}
          onChoose={setChoice}
        />
      )}

      <ConfirmPurchase
        choice={choice}
        instant={overview.provider === "telnyx"}
        onClose={() => setChoice(null)}
        onDone={(status) => {
          setChoice(null);
          setMessage(
            status === "a_regler"
              ? "Commande créée : finalise le paiement ci-dessus pour activer ton numéro."
              : "Commande envoyée. Ton numéro sera actif dans quelques minutes.",
          );
          load();
          onChanged();
        }}
      />

      <Dialog
        open={releasing !== null}
        onOpenChange={(open) => !open && setReleasing(null)}
      >
        <CenteredDialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce numéro ?</DialogTitle>
            <DialogDescription>
              {releasing ? formatPhone(releasing) : ""} sera résilié. Il reste
              actif jusqu'à la fin de la période déjà payée, puis il n'est plus
              facturé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleasing(null)}>
              Garder
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const sn = releasing;
                setReleasing(null);
                if (sn)
                  run(
                    sn,
                    () => releaseNumber(session!.sessionId, sn),
                    "Erreur lors de la suppression.",
                  );
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </CenteredDialogContent>
      </Dialog>
    </div>
  );
}
