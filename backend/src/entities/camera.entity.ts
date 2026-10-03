import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { NvrDevice } from './nvr-device.entity';

export type CameraVariant = 'main' | 'sub';

@Entity('cameras')
export class Camera {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  nvrId: string;

  @ManyToOne(() => NvrDevice, (nvr) => nvr.cameras, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nvrId' })
  nvr: NvrDevice;

  @Column()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  /** DM Mediaserver stream key / src query param */
  @Column()
  streamKey: string;

  @Column({ type: 'varchar', nullable: true })
  rtspUrl: string | null;

  @Column({ type: 'varchar', default: 'sub' })
  variant: CameraVariant;

  @CreateDateColumn()
  createdAt: Date;
}
