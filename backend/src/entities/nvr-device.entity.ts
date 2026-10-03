import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';
import { Camera } from './camera.entity';

export type NvrStatus = 'offline' | 'online';

@Entity('nvr_devices')
export class NvrDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  organizationId: string;

  @ManyToOne(() => Organization, (org) => org.nvrs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdByUserId' })
  createdBy: User | null;

  @Column({ type: 'varchar', default: 'offline' })
  status: NvrStatus;

  @OneToMany(() => Camera, (camera) => camera.nvr)
  cameras: Camera[];

  @CreateDateColumn()
  createdAt: Date;
}
