# EKS Module — creates EKS cluster with managed node groups

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "hft"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "subnet_ids" {
  description = "Subnet IDs for the EKS cluster control-plane ENIs (public + private for cross-AZ coverage)"
  type        = list(string)
}

variable "node_subnet_ids" {
  description = "Subnet IDs for worker nodes — pass private subnets only; public subnets assign nodes public IPs"
  type        = list(string)
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster (must be within EKS standard support)"
  type        = string
  default     = "1.32"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs allowed to reach the public cluster API endpoint. Empty = public endpoint disabled (private-only API)."
  type        = list(string)
  default     = []
}

variable "node_instance_type" {
  description = "EC2 instance type for worker nodes"
  type        = string
  default     = "t3.medium"
}

variable "node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 4
}

# KMS key for envelope encryption of Kubernetes secrets in etcd
resource "aws_kms_key" "eks_secrets" {
  description         = "${var.name_prefix}-${var.environment} EKS secrets encryption"
  enable_key_rotation = true

  tags = {
    Environment = var.environment
  }
}

resource "aws_kms_alias" "eks_secrets" {
  name          = "alias/${var.name_prefix}-eks-secrets-${var.environment}"
  target_key_id = aws_kms_key.eks_secrets.key_id
}

# EKS cluster
resource "aws_eks_cluster" "main" {
  name     = "${var.name_prefix}-${var.environment}"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.cluster_version

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks_secrets.arn
    }
    resources = ["secrets"]
  }

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = length(var.cluster_endpoint_public_access_cidrs) > 0
    public_access_cidrs     = var.cluster_endpoint_public_access_cidrs
  }

  tags = {
    Environment = var.environment
  }
}

# IAM role for EKS cluster
resource "aws_iam_role" "eks_cluster" {
  name = "${var.name_prefix}-eks-cluster-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

# IAM role for node group
resource "aws_iam_role" "eks_node_group" {
  name = "${var.name_prefix}-eks-node-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node_group.name
}

resource "aws_iam_role_policy_attachment" "ecr_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node_group.name
}

# Managed node group
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.name_prefix}-nodes"
  node_role_arn   = aws_iam_role.eks_node_group.arn
  subnet_ids      = var.node_subnet_ids

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  instance_types = [var.node_instance_type]

  tags = {
    Environment = var.environment
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
  ]
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}
