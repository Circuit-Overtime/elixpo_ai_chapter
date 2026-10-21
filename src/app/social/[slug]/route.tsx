/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { getPackage, PACKAGE_RECORDS } from "@/lib/packages";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return [{ slug: "index" }, ...PACKAGE_RECORDS.map(({ slug }) => ({ slug }))]; }

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = slug === "index" ? undefined : getPackage(slug);
  if (slug !== "index" && !record) return new Response("Social card not found.\n", { status: 404 });
  const title = record?.name ?? "Packages with a public path from source to signed release.";
  const description = record?.summary ?? "Native tools, signed Linux applications, and maintained developer packages from Elixpo, connected to source, releases, licensing, and support.";
  const label = record ? `${record.kind === "linux" ? "Signed APT" : record.kind === "native" ? "Verified native release" : "npm"} · ${record.status} · v${record.version}` : `${PACKAGE_RECORDS.length} maintained package records`;
  const titleSize = title.length > 70 ? 58 : 76;
  const summary = description.length > 185 ? `${description.slice(0, 182).trimEnd()}…` : description;
  return new ImageResponse(<div style={{ width:"100%",height:"100%",display:"flex",position:"relative",overflow:"hidden",background:"#f7f6f0",color:"#111915",fontFamily:"Arial, sans-serif",padding:"64px 72px" }}><div style={{ position:"absolute",width:710,height:710,borderRadius:999,right:-180,top:-220,background:"#d9eee3" }}/><div style={{ position:"absolute",width:450,height:450,borderRadius:999,right:25,top:65,border:"2px solid rgba(17,25,21,.18)" }}/><div style={{ position:"absolute",width:255,height:170,right:110,top:170,borderRadius:28,background:record?.kind === "npm" ? "#cb3837" : record?.kind === "native" ? "#315fca" : "#0f6847",transform:"rotate(-8deg)",boxShadow:"0 25px 50px rgba(17,25,21,.18)" }}/><div style={{ position:"relative",width:850,display:"flex",flexDirection:"column" }}><div style={{ display:"flex",alignItems:"center",gap:14 }}><img src="https://elixpo.com/logos/logo.png" style={{ width:38,height:38 }} alt=""/><span style={{ color:"#0f6847",fontSize:17,fontWeight:700,letterSpacing:4,textTransform:"uppercase" }}>Elixpo Packages</span></div><div style={{ display:"flex",marginTop:48,fontSize:titleSize,fontWeight:700,lineHeight:.94,letterSpacing:-3.5 }}>{title}</div><div style={{ display:"flex",marginTop:25,maxWidth:760,color:"#5f6862",fontSize:21,lineHeight:1.4 }}>{summary}</div><div style={{ display:"flex",marginTop:"auto",alignItems:"center",gap:16 }}><span style={{ display:"flex",padding:"10px 16px",borderRadius:999,background:"#111915",color:"white",fontSize:14,textTransform:"uppercase",letterSpacing:2 }}>{label}</span><span style={{ color:"#5f6862",fontSize:17 }}>packages.elixpo.com</span></div></div></div>, { width:1200,height:630 });
}
