import Image from "next/image";
import Link from "next/link";
import styles from "./Landing.module.css";

export function SheetPreview() {
  return <div className={styles.maskPrintable}>
    <Image src="/landing/animal-mask-template.svg" alt="Printable animal mask with pointed ears, eye holes and space to stick leaves" width={840} height={594} />
    <a className={styles.previewLink} href="/landing/animal-mask-template.svg" download>Download the mask template →</a>
    <Link className={styles.previewLink} href="/print?session=animal-leaf-masks">Open the print bundle →</Link>
  </div>;
}
